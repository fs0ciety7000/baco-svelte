import { Badge } from "@/components/ui/status-badge";
import type { Impact } from "@/lib/pmr/train-delay";
import { cn } from "@/lib/utils";

// La puce du n° de train vit dans `components/ui/train-chip.tsx` (v4) ; reste ici le badge de retard (données PMR).

/**
 * Retard du train à la gare assistée (iRail, cron `mission-trains`) : « +12 » (ambre, rouge dès 15 min) ou « Supprimé ».
 * Rien quand le train est à l'heure ou n'est pas suivi (suivi le jour même seulement).
 */
export function DelayBadge({ impact, className }: { impact: Impact | null; className?: string }) {
  if (!impact) return null;
  const label = impact.cancelled ? "Supprimé" : `+${impact.delay}`;
  const title = impact.cancelled
    ? `Arrêt supprimé à ${impact.station} (iRail)`
    : `${impact.delay} min de retard à ${impact.station}${impact.left ? " (déjà parti)" : ""} (iRail)`;
  return (
    <Badge
      tone={impact.cancelled || impact.delay >= 15 ? "danger" : "warn"}
      title={title}
      aria-label={title}
      data-testid="delay-badge"
      className={cn("font-mono tabular", impact.left && "opacity-60", className)}
    >
      {label}
    </Badge>
  );
}
