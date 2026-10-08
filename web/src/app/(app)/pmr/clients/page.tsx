import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Clients PMR · CSM" };

export default async function Page() {
  await requirePermission("pmr:read");
  return <ComingSoon title="Clients PMR" />;
}
