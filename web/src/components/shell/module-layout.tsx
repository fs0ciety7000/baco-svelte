import type { ReactNode } from "react";

import { ModuleTabs } from "./module-tabs";

/**
 * Mise en page d'un module. Depuis le 11 oct. 2026 (haut de page sur une ligne), le titre et les onglets sont dans la
 * barre du haut : ici, le titre reste pour les lecteurs d'écran, la ligne visible ne porte que l'information utile et
 * les actions (si présentes), et les onglets ne s'affichent que sous 768 px.
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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 md:gap-4 md:px-6 md:py-4">
      <header className="flex flex-col gap-2 empty:hidden">
        <h1 className="sr-only">{title}</h1>
        {eyebrow || actions ? (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {eyebrow ? (
              <p className="min-w-0 truncate text-small text-fg-muted">{eyebrow}</p>
            ) : (
              <span />
            )}
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
        ) : null}
        <div className="md:hidden">
          <ModuleTabs moduleId={moduleId} />
        </div>
      </header>
      <div data-page-body className="flex min-w-0 flex-col gap-4">
        {children}
      </div>
    </div>
  );
}
