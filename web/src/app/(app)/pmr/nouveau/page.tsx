import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Nouvelle prestation PMR · CSM" };

export default async function Page() {
  await requirePermission("deplacements:write");
  return <ComingSoon title="Nouvelle prestation PMR" />;
}
