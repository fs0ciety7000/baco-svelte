import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Prestations du jour · CSM" };

export default async function Page() {
  await requirePermission("deplacements:read");
  return <ComingSoon title="Prestations du jour" />;
}
