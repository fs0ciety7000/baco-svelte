import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Nouvelle entrée de main courante · CSM" };

export default async function Page() {
  await requirePermission("journal:write");
  return <ComingSoon title="Nouvelle entrée de main courante" />;
}
