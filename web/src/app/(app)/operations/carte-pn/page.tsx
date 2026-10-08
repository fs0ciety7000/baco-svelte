import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Carte des passages à niveau · CSM" };

export default async function Page() {
  await requirePermission("carte_pn:read");
  return <ComingSoon title="Carte des passages à niveau" />;
}
