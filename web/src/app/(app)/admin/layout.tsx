import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ModuleLayout } from "@/components/shell/module-layout";
import { adminModule } from "@/navigation";
import { requireUser } from "@/server/auth";

// Administration : admin / sysop voient tout ; un rôle qui a reçu `referentiels:manage` ne voit que le groupe
// Référentiels (navigation v3). Chaque page garde sa propre garde (requireAdmin ou requirePermission) : le layout ne suffit
// pas (le contenu d'une page part dans le flux RSC même si le layout refuse).
export default async function Layout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  if (!adminModule(user)) notFound();
  return (
    <ModuleLayout moduleId="admin" title="Administration">
      {children}
    </ModuleLayout>
  );
}
