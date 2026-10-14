import { Badge } from "@/components/ui/status-badge";

/** Badge d'un bon clôturé depuis plus de 30 jours (Commandes › Archives, fiche, ⌘K) : `isArchivedOrder`. */
export function ArchivedBadge() {
  return (
    <Badge tone="neutral" data-testid="archived-badge">
      Archivé
    </Badge>
  );
}
