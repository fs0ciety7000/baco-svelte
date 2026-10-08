import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Suivi commun · CSM" };

export default async function Page() {
  await requirePermission("otto:read");
  return <ComingSoon title="Suivi commun" />;
}
