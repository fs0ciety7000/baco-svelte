import type * as React from "react";

import { isCancelled, isPmr, type PlannerTask } from "@/lib/planner";
import { cn } from "@/lib/utils";

// Repères visuels communs du planificateur (Gantt, liste « À attribuer », panneau, agenda mobile) : couleur par
// catégorie en jetons (IN = info, OUT = progress, technique / autre = fg-muted), pastilles de sens et de type.

export const TONE: Record<PlannerTask["kind"], string> = {
  pmr_in: "var(--info)",
  pmr_out: "var(--progress)",
  technique: "var(--fg-muted)",
  autre: "var(--fg-muted)",
  trajet: "var(--fg-subtle)",
};

/** Style d'un bloc / d'une carte : fond teinté, trait gauche de la catégorie. */
export function toneStyle(kind: PlannerTask["kind"]): React.CSSProperties {
  return { "--tone": TONE[kind] } as React.CSSProperties;
}

export const TONED =
  "border border-[color-mix(in_oklab,var(--tone)_35%,var(--border))] border-l-[3px] border-l-(--tone) bg-[color-mix(in_oklab,var(--tone)_12%,var(--surface))]";

export function DirChip({ task, className }: { task: PlannerTask; className?: string }) {
  if (!isPmr(task)) return null;
  const inbound = task.kind === "pmr_in";
  return (
    <span
      className={cn(
        "font-mono text-label font-semibold",
        inbound ? "text-info" : "text-progress",
        className,
      )}
      title={inbound ? "IN · embarquement" : "OUT · débarquement"}
    >
      {inbound ? "IN" : "OUT"}
    </span>
  );
}

/** « 1MR », « 2CRF », « EDF 1707 ». */
export function PaxChip({ task, className }: { task: PlannerTask; className?: string }) {
  const text = isPmr(task)
    ? `${Math.max(1, task.pax || 1)}${task.pmrType && task.pmrType !== "AUTRE" ? task.pmrType : " PMR"}`
    : task.label || (task.kind === "technique" ? "Technique" : "Tâche");
  return (
    <span
      className={cn(
        "inline-flex h-[1.375rem] max-w-full items-center truncate rounded-pill bg-surface-2 px-2 font-mono text-label font-semibold text-fg",
        isCancelled(task) && "line-through",
        className,
      )}
    >
      {text}
    </span>
  );
}
