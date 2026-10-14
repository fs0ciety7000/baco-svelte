import type { ReactNode } from "react";

import { ModuleLayout } from "@/components/shell/module-layout";

// Extension CSM (DICOS, ATMS, Quinyx) : hors module depuis la navigation v3 (14 oct. 2026), ouverte depuis le menu du
// compte et les liens de PMR, du Planning et du profil.
export default async function Layout({ children }: { children: ReactNode }) {
  return (
    <ModuleLayout moduleId="compte" title="Extension CSM">
      {children}
    </ModuleLayout>
  );
}
