import { Badge } from "@/components/ui/status-badge";

const TITLE =
  "Encore « prévue » dans CSM, mais absente de la dernière synchro DICOS complète de l'agent qui l'avait vue : " +
  "probablement annulée ou supprimée dans DICOS. À vérifier avant d'agir.";

/** Mission ou groupe « Absente de DICOS » (`isAbsentFromDicos`, 11 oct. 2026). */
export function AbsentBadge({ className }: { className?: string }) {
  return (
    <Badge
      tone="warn"
      title={TITLE}
      aria-label={`Absente de DICOS. ${TITLE}`}
      data-testid="absent-badge"
      className={className}
    >
      Absente de DICOS
    </Badge>
  );
}
