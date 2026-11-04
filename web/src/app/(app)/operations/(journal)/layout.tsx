import type { ReactNode } from "react";

import { ModuleLayout } from "@/components/shell/module-layout";

/**
 * Module « Journal » (4 nov. 2026, demande : « mettre le journal dans la sidebar ») : Infos et Perturbations, sortis
 * d'Opérations. Groupe de routes : les adresses restent /operations/journal et /operations/perturbations (liens des
 * notifications déjà en base, favoris).
 */
export default async function Layout({ children }: { children: ReactNode }) {
  return (
    <ModuleLayout moduleId="journal" title="Journal">
      {children}
    </ModuleLayout>
  );
}
