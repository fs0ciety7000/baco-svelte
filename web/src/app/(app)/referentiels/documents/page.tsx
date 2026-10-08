import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Procédures et documents · CSM" };

export default async function Page() {
  await requirePermission("documents:read");
  return <ComingSoon title="Procédures et documents" />;
}
