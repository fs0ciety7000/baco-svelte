import type { ReactNode } from "react";

import { ModuleLayout } from "@/components/shell/module-layout";

export default async function Layout({ children }: { children: ReactNode }) {
  return (
    <ModuleLayout moduleId="operations" title="Opérations" eyebrow="// Opérations">
      {children}
    </ModuleLayout>
  );
}
