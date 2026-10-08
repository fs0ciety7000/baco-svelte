import type { ReactNode } from "react";

import { ModuleLayout } from "@/components/shell/module-layout";

export default async function Layout({ children }: { children: ReactNode }) {
  return (
    <ModuleLayout
      moduleId="referentiels"
      title="Annuaire et données"
      eyebrow="// Annuaire et données"
    >
      {children}
    </ModuleLayout>
  );
}
