import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Remise B201 · CSM" };

export default async function Page() {
  await requirePermission("b201:read");
  return <ComingSoon title="Remise B201" />;
}
