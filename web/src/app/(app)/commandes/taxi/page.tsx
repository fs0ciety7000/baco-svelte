import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Commandes taxi · CSM" };

export default async function Page() {
  await requirePermission("generate_taxi:read");
  return <ComingSoon title="Commandes taxi" />;
}
