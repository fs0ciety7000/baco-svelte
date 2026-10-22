import { Badge } from "@/components/ui/status-badge";

const TITLE =
  "Encore « prévue » dans CSM, mais absente de la dernière synchro DICOS complète de l'agent qui l'avait vue : " +
  "probablement annulée ou supprimée dans DICOS. À vérifier avant d'agir.";

/** Mission ou groupe « Absente de DICOS » (`isAbsentFromDicos`, 11 oct. 2026). */
export function AbsentBadge({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <Badge
      tone="warn"
      title={TITLE}
      aria-label={`Absente de DICOS. ${TITLE}`}
      data-testid="absent-badge"
      className={className}
    >
      {/* Tableaux : libellé court sous le statut (22 oct. 2026 : le libellé long élargissait la colonne au point de faire
          défiler le tableau). Le nom accessible et l'infobulle gardent la phrase complète. */}
      {compact ? "Hors DICOS" : "Absente de DICOS"}
    </Badge>
  );
}
