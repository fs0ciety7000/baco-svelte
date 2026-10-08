import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "PtCar · CSM" };

export default async function Page() {
  await requirePermission("ptcar:read");
  return <ComingSoon title="PtCar" />;
}
