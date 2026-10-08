import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Nouveau bon de commande taxi · CSM" };

export default async function Page() {
  await requirePermission("generate_taxi:write");
  return <ComingSoon title="Nouveau bon de commande taxi" />;
}
