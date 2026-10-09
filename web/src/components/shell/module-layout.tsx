import type { ReactNode } from "react";

import { ModuleTabs } from "./module-tabs";

/**
 * Mise en page d'un module : en-tête compact sur une ligne (titre, information utile, actions) puis onglets en routes.
 * Le fil d'Ariane reste dans la barre du haut (audit UI du 9 oct. 2026 : en-tête répété 4 fois, ≈ 140 px).
 */
export function ModuleLayout({
  moduleId,
  title,
  eyebrow,
  actions,
  children,
}: {
  moduleId: string;
  title: string;
  /** Information complémentaire courte (ex. « Réservé aux administrateurs »), affichée à côté du titre. */
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 md:px-6 md:py-5">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="display truncate text-h3 text-fg md:text-h2">{title}</h1>
            {eyebrow ? <p className="truncate text-small text-fg-muted">{eyebrow}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        <ModuleTabs moduleId={moduleId} />
      </header>
      {children}
    </div>
  );
}
