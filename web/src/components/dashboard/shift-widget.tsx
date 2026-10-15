"use client";

import { useEffect, useState, useTransition } from "react";

import { toast } from "@/components/ui/toast";
import { brusselsTime } from "@/lib/orders/time";
import {
  clockLabel,
  durationLabel,
  isStale,
  SHIFT_KINDS,
  SHIFTS,
  shiftState,
  windowState,
  type ShiftChoice,
  type ShiftKind,
} from "@/lib/shift";
import { cn } from "@/lib/utils";

import { saveShift } from "@/app/dashboard-actions";

// Widget « Fin de service » (11 oct. 2026) : l'agent choisit son service, l'accueil décompte le temps restant.
// Premier rendu (serveur ET hydratation) à l'heure du rendu serveur (`renderedAt`) : même contenu des deux côtés, donc
// ni erreur d'hydratation ni saut de mise en page (CLS de 54 px en mobile avec l'ancien espace réservé, 15 oct.) ;
// l'heure du navigateur prend le relais au montage, une mise à jour par seconde, arrêtée onglet caché.

/** Prestation Quinyx du jour (rattachement validé par un admin) : prend le pas sur les horaires supposés. */
export type QuinyxShift = { start: string; end: string; label: string; kind: ShiftKind | "autre" };

export function ShiftWidget({
  initial,
  quinyx = null,
  renderedAt,
}: {
  initial: ShiftChoice | null;
  quinyx?: QuinyxShift | null;
  /** Heure du rendu serveur (ms) : sans elle, le décompte n'apparaît qu'après le montage. */
  renderedAt?: number;
}) {
  const [choice, setChoice] = useState(initial);
  const [now, setNow] = useState<Date | null>(() => (renderedAt ? new Date(renderedAt) : null));
  const [pending, start] = useTransition();

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const run = () => {
      setNow(new Date());
      if (!id) id = setInterval(() => setNow(new Date()), 1000);
    };
    const stop = () => {
      if (id) clearInterval(id);
      id = null;
    };
    const onVis = () => (document.hidden ? stop() : run());
    run();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const pick = (kind: ShiftKind | null) =>
    start(async () => {
      const previous = choice;
      try {
        setChoice(await saveShift(kind));
      } catch {
        setChoice(previous);
        toast.error("Enregistrement impossible", { description: "Réessaie dans un instant." });
      }
    });

  const active = choice && now && !isStale(choice, now) ? choice : null;
  // Sans choix manuel, l'horaire réel publié dans Quinyx (fin à 15 h si la prestation finit à 15 h).
  const real =
    !active && quinyx && now
      ? windowState(new Date(quinyx.start), new Date(quinyx.end), now)
      : null;
  const state = active && now ? shiftState(active, now) : real;

  return (
    <div className="flex flex-col gap-3" data-testid="shift-widget">
      <div role="group" aria-label="Mon service" className="grid grid-cols-4 gap-1.5">
        {SHIFT_KINDS.map((k) => {
          const on = active ? active.kind === k : !!real && quinyx?.kind === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              disabled={pending}
              onClick={() => pick(on ? null : k)}
              className={cn(
                "flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-control border px-1 py-1 transition-colors disabled:cursor-wait",
                on
                  ? "border-accent bg-accent-soft text-fg"
                  : "border-border-strong text-fg-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <span className="text-small font-semibold text-fg">{SHIFTS[k].label}</span>
              <span className="font-mono text-label whitespace-nowrap tabular">
                {SHIFTS[k].start.slice(0, 2)}–{SHIFTS[k].end.slice(0, 2)} h
              </span>
            </button>
          );
        })}
      </div>

      {quinyx && !active ? (
        <p className="text-small text-fg-muted" data-testid="shift-quinyx">
          Selon Quinyx : <span className="text-fg">{quinyx.label}</span>
        </p>
      ) : null}
      {!now ? (
        <div className="h-[4.5rem]" aria-hidden />
      ) : !state ? (
        <p className="text-small text-fg-muted">Choisis ton service pour voir le temps restant.</p>
      ) : state.phase === "en-cours" ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p
              className={cn(
                "font-mono text-stat leading-none font-semibold tabular",
                state.remaining <= 15 * 60_000 ? "text-ok" : "text-fg",
              )}
              aria-hidden
            >
              {clockLabel(state.remaining)}
            </p>
            <p className="text-small text-fg-muted">
              fin à <span className="font-mono tabular text-fg">{brusselsTime(state.end)}</span>
            </p>
          </div>
          {/* Annonce lisible, sans relire chaque seconde. */}
          <p className="sr-only">
            Il te reste {durationLabel(state.remaining)}, fin à {brusselsTime(state.end)}.
          </p>
          <div
            role="progressbar"
            aria-label="Service écoulé"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(state.progress * 100)}
            className="h-2 overflow-hidden rounded-control bg-surface-2"
          >
            <div
              className="h-full w-full origin-left bg-progress transition-transform duration-1000 ease-linear motion-reduce:transition-none"
              style={{ transform: `scaleX(${state.progress.toFixed(4)})` }}
            />
          </div>
          <p className="text-small text-fg-muted">
            {Math.round(state.progress * 100)} % du service · commencé à {brusselsTime(state.start)}
          </p>
        </div>
      ) : state.phase === "avant" ? (
        <p className="text-body text-fg">
          Ton service commence dans{" "}
          <span className="font-mono font-semibold tabular">{durationLabel(state.untilStart)}</span>{" "}
          <span className="text-fg-muted">(à {brusselsTime(state.start)})</span>
        </p>
      ) : (
        <p className="text-body text-fg">
          Service terminé à{" "}
          <span className="font-mono font-semibold tabular">{brusselsTime(state.end)}</span>. Bon
          repos !
        </p>
      )}
    </div>
  );
}
