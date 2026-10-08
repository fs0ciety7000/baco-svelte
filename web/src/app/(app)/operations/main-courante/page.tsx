import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Main courante · CSM" };

export default async function Page() {
  await requirePermission("journal:read");
  return <ComingSoon title="Main courante" />;
}
