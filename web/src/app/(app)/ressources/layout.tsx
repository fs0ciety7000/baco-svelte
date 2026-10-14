import type { ReactNode } from "react";

import { ModuleLayout } from "@/components/shell/module-layout";

// Ressources (navigation v3, 14 oct. 2026) : contacts, collègues, planning, procédures et documents, B201.
export default async function Layout({ children }: { children: ReactNode }) {
  return (
    <ModuleLayout moduleId="ressources" title="Ressources">
      {children}
    </ModuleLayout>
  );
}
