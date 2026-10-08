import type { ReactNode } from "react";

import { PageHeader } from "@/components/ui/misc";

import { ModuleTabs } from "./module-tabs";

/** Mise en page d'un module : en-tête (eyebrow, titre display, actions) puis onglets en routes. */
export function ModuleLayout({
  moduleId,
  title,
  eyebrow,
  actions,
  children,
}: {
  moduleId: string;
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-6 md:py-6">
      <PageHeader eyebrow={eyebrow} title={title} actions={actions}>
        <ModuleTabs moduleId={moduleId} />
      </PageHeader>
      {children}
    </div>
  );
}
