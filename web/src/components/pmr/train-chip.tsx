import { cn } from "@/lib/utils";

/**
 * N° de train mis en avant (première colonne des Missions PMR et des Groupes, demande du 9 oct. 2026) : puce inversée
 * neutre (texte du thème sur fond, et inversement) plutôt que l'accent, réservé à l'action (audit du 9 oct. 2026).
 */
export function TrainChip({
  train,
  taxi,
  className,
}: {
  train: string;
  taxi?: boolean;
  className?: string;
}) {
  if (taxi)
    return (
      <span
        title={train || "Taxi"}
        className={cn(
          "inline-flex min-w-14 justify-center rounded-[min(var(--r-control),6px)] border border-border-strong px-1.5 py-0.5 font-mono text-body font-bold text-fg",
          className,
        )}
      >
        Taxi
      </span>
    );
  return (
    <span
      className={cn(
        "inline-flex min-w-14 justify-center rounded-[min(var(--r-control),6px)] bg-fg px-1.5 py-0.5 font-mono text-body font-bold text-bg tabular",
        !train && "bg-surface-2 text-fg-muted",
        className,
      )}
    >
      {train || "—"}
    </span>
  );
}
