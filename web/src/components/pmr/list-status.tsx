import type { ReactNode } from "react";

/**
 * Ligne d'état sous la barre d'outils (Missions PMR, Groupes, Historique ; v4 lot 4) : nombre de résultats, fraîcheur de
 * la synchro DICOS, indicateur « En direct ». Une seule ligne de texte 13 px : le premier résultat reste haut en mobile.
 */
export function ListStatus({
  count,
  sync,
  live,
}: {
  count: ReactNode;
  sync?: ReactNode;
  live?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-fg-muted">
      {count}
      {sync ? (
        <>
          <span aria-hidden className="text-fg-subtle max-sm:hidden">
            ·
          </span>
          {sync}
        </>
      ) : null}
      {live ? <span className="ml-auto">{live}</span> : null}
    </div>
  );
}
