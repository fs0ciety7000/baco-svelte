import type { ReactNode } from "react";

import { RefAdminNav } from "@/components/admin/referentiels/ref-admin-nav";

// Administration › Référentiels : barre des écrans (tableau de bord, gares, lignes, PtCar, EBP, SPI, PN, imports). Les
// gardes sont dans chaque page (`referentiels:manage`).
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <RefAdminNav />
      {children}
    </div>
  );
}
