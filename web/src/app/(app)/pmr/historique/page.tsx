import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Historique des prestations · CSM" };

export default async function Page() {
  await requirePermission("deplacements:read");
  return <ComingSoon title="Historique des prestations" />;
}
