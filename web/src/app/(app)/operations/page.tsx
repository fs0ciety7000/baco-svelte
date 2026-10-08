import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Trains en direct · CSM" };

export default async function Page() {
  await requirePermission("live:read");
  return <ComingSoon title="Trains en direct" />;
}
