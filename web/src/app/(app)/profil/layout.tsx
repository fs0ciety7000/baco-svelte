import type { ReactNode } from "react";

import { ModuleLayout } from "@/components/shell/module-layout";

// Mon profil : hors module depuis la navigation v3 (14 oct. 2026), ouvert depuis le menu du compte.
export default async function Layout({ children }: { children: ReactNode }) {
  return (
    <ModuleLayout moduleId="compte" title="Mon profil">
      {children}
    </ModuleLayout>
  );
}
