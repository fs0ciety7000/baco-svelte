import type { ReactNode } from "react";

import { ModuleLayout } from "@/components/shell/module-layout";

// Réseau (navigation v3, 14 oct. 2026) : trains en direct et référentiels du réseau, en consultation (la gestion est dans
// Administration › Référentiels).
export default async function Layout({ children }: { children: ReactNode }) {
  return (
    <ModuleLayout moduleId="reseau" title="Réseau">
      {children}
    </ModuleLayout>
  );
}
