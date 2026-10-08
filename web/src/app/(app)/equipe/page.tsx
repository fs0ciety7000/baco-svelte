import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Planning et congés · CSM" };

export default async function Page() {
  await requirePermission("planning:read");
  return <ComingSoon title="Planning et congés" />;
}
