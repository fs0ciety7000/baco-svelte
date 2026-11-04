"use client";

import { ArrowRight } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { markTourSeen } from "@/app/tour-actions";
import { CsmLogo } from "@/components/brand/csm-logo";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  availableChapters,
  plannedSteps,
  type ChapterId,
  type PlannedStep,
} from "@/lib/tour/steps";
import { pl } from "@/lib/utils";

import { TourRunner } from "./tour-runner";

type TourContext = {
  /** Ouvre la fenêtre d'accueil (choix des chapitres). */
  openWelcome: () => void;
  /** Lance la visite (tous les chapitres visibles si vide). */
  start: (chapters?: ChapterId[]) => void;
  running: boolean;
};

const Ctx = createContext<TourContext | null>(null);

export function useTour(): TourContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTour hors du shell");
  return ctx;
}

// Écriture de la préférence en file (lire-modifier-écrire de `users.preferences` : jamais deux à la fois depuis la visite).
let queue: Promise<unknown> = Promise.resolve();
function enqueue(job: () => Promise<unknown>) {
  queue = queue.then(job, job).catch(() => undefined);
}

const isMobile = () =>
  typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;

/**
 * Visite guidée (4 nov. 2026) : fenêtre d'accueil (logo animé, « Commencer la visite » / « Plus tard », choix d'un
 * chapitre) puis déroulé (`TourRunner`). `autoStart` : première connexion d'un compte qui n'a pas vu la visite (calculé
 * par le layout : jamais pour l'Écran ni pendant « Voir en tant que ») ; tout choix dans la fenêtre la note comme vue.
 * Relance : menu du compte et ⌘K (`useTour().openWelcome()`).
 */
export function TourProvider({
  autoStart = false,
  children,
}: {
  autoStart?: boolean;
  children: ReactNode;
}) {
  const { user } = useShell();
  const [welcome, setWelcome] = useState<"first" | "again" | null>(null);
  const [steps, setSteps] = useState<PlannedStep[] | null>(null);
  const [mobile, setMobile] = useState(false);
  const pending = useRef(autoStart);
  // Lancement depuis la fenêtre : le focus ne doit pas y revenir (il va à la carte de la visite).
  const starting = useRef(false);

  const markSeen = useCallback(() => {
    if (!pending.current) return;
    pending.current = false;
    enqueue(() => markTourSeen());
  }, []);

  useEffect(() => {
    if (!autoStart) return;
    // Après le premier affichage de la page (le logo s'anime sur une page déjà posée).
    const t = window.setTimeout(() => setWelcome("first"), 450);
    return () => window.clearTimeout(t);
  }, [autoStart]);

  const openWelcome = useCallback(() => {
    setMobile(isMobile());
    setWelcome((w) => w ?? "again");
  }, []);

  const start = useCallback(
    (chapters: ChapterId[] = []) => {
      markSeen();
      starting.current = true;
      const list = plannedSteps(user, chapters, { mobile: isMobile() });
      setWelcome(null);
      if (list.length) setSteps(list);
    },
    [user, markSeen],
  );

  useEffect(() => {
    if (welcome) setMobile(isMobile());
  }, [welcome]);

  const chapters = useMemo(() => availableChapters(user, { mobile }), [user, mobile]);
  const value = useMemo(
    () => ({ openWelcome, start, running: !!steps }),
    [openWelcome, start, steps],
  );

  const close = () => {
    markSeen();
    setWelcome(null);
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog open={!!welcome} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent
          eyebrow={welcome === "first" ? "Première connexion" : "Aide"}
          title={welcome === "first" ? "Bienvenue dans CSM" : "Visite guidée"}
          description="Quelques étapes pour prendre tes repères, environ deux minutes."
          className="max-w-lg"
          data-testid="tour-welcome"
          onCloseAutoFocus={(e) => {
            if (starting.current) e.preventDefault();
            starting.current = false;
          }}
        >
          <div className="flex flex-col gap-4">
            <CsmLogo animate className="h-9 w-auto self-start" />
            <p className="text-small text-fg-muted">
              Choisis un chapitre, ou lance toute la visite.{" "}
              {welcome === "first"
                ? "Tu la retrouveras dans le menu de ton compte (« Visite guidée »)."
                : null}
            </p>
            <ul className="flex flex-col gap-2">
              {chapters.map((c) => {
                const n = plannedSteps(user, [c.id], { mobile }).length;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => start([c.id])}
                      data-testid={`tour-chapter-${c.id}`}
                      className="group flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-control border border-border bg-(--control-bg) px-3 py-2 text-left outline-none hover:border-border-strong hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-body font-medium text-fg">{c.title}</span>
                        <span className="text-small text-fg-muted">{c.summary}</span>
                      </span>
                      <span className="shrink-0 text-small text-fg-subtle tabular">
                        {n} {pl(n, "étape")}
                      </span>
                      <ArrowRight
                        aria-hidden
                        className="size-4 shrink-0 text-fg-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={close} data-testid="tour-later">
              {welcome === "first" ? "Plus tard" : "Fermer"}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => start()}
              data-testid="tour-start"
            >
              Commencer la visite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {steps ? <TourRunner steps={steps} onEnd={() => setSteps(null)} /> : null}
    </Ctx.Provider>
  );
}
