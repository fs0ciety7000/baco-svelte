import type { ReactNode } from "react";

import { ModuleLayout } from "@/components/shell/module-layout";

// /groupes (demande du 9 oct. 2026) : route courte, toujours présentée comme un onglet du module PMR.
export default async function Layout({ children }: { children: ReactNode }) {
  return (
    <ModuleLayout moduleId="pmr" title="PMR" eyebrow="// Assistance PMR">
      {children}
    </ModuleLayout>
  );
}
