import type { ReactNode } from "react";

import { ModuleLayout } from "@/components/shell/module-layout";

// Statistiques : onglet de l'Accueil depuis la navigation v3 (14 oct. 2026).
export default async function Layout({ children }: { children: ReactNode }) {
  return (
    <ModuleLayout moduleId="accueil" title="Statistiques">
      {children}
    </ModuleLayout>
  );
}
