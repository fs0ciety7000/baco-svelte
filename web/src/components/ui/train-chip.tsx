import { cn } from "@/lib/utils";

/**
 * N° de train (v4, 15 oct. 2026 : remonté de `components/pmr` dans `ui`) : le repère n° 1 de l'opérateur, partout
 * identique. Encre inversée (texte du thème sur fond, et inversement), mono à chiffres tabulaires ; jamais l'accent,
 * réservé à l'action (audit du 9 oct. 2026). `size="md"` (défaut) en première colonne des tableaux, `sm` dans une ligne
 * de texte (méta, file « À traiter »). Taxi : contour, sans fond.
 */
export function TrainChip({
  train,
  taxi,
  size = "md",
  className,
}: {
  train: string;
  taxi?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const base = cn(
    "inline-flex shrink-0 items-center justify-center rounded-[min(var(--r-control),5px)] font-mono font-semibold tracking-[-0.01em] whitespace-nowrap tabular",
    size === "md" ? "h-6 min-w-14 px-1.5 text-body" : "h-[1.375rem] px-1.5 text-label",
  );
  if (taxi)
    return (
      <span
        data-slot="train-chip"
        title={train || "Taxi"}
        className={cn(base, "border border-border-strong text-fg", className)}
      >
        Taxi
      </span>
    );
  return (
    <span
      data-slot="train-chip"
      className={cn(base, train ? "bg-fg text-bg" : "bg-surface-2 text-fg-muted", className)}
    >
      {train || "—"}
    </span>
  );
}
