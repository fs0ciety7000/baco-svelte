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
  type ShiftChoice,
  type ShiftKind,
} from "@/lib/shift";
import { cn } from "@/lib/utils";

import { saveShift } from "@/app/dashboard-actions";

// Widget « Fin de service » (11 oct. 2026) : l'agent choisit son service, l'accueil décompte le temps restant.
// Rendu du décompte après le montage seulement (l'heure du serveur et du navigateur diffèrent : pas d'erreur
// d'hydratation) ; une mise à jour par seconde, arrêtée onglet caché.

export function ShiftWidget({ initial }: { initial: ShiftChoice | null }) {
  const [choice, setChoice] = useState(initial);
  const [now, setNow] = useState<Date | null>(null);
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
  const state = active && now ? shiftState(active, now) : null;

  return (
    <div className="flex flex-col gap-3" data-testid="shift-widget">
      <div role="group" aria-label="Mon service" className="grid grid-cols-4 gap-1.5">
        {SHIFT_KINDS.map((k) => {
          const on = active?.kind === k;
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
              className="h-full bg-progress transition-[width] duration-1000 ease-linear"
              style={{ width: `${(state.progress * 100).toFixed(2)}%` }}
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
