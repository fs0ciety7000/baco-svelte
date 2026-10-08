import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Statistiques · CSM" };

export default async function Page() {
  await requirePermission("stats:read");
  return <ComingSoon title="Statistiques" />;
}
