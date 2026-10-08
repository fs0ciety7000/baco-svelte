import type { ReactNode } from "react";

import { ModuleLayout } from "@/components/shell/module-layout";
import { requireAdmin } from "@/server/auth";

export default async function Layout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <ModuleLayout
      moduleId="admin"
      title="Administration"
      eyebrow="// Administration · réservé aux administrateurs"
    >
      {children}
    </ModuleLayout>
  );
}
