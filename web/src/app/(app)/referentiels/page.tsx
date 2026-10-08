import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Annuaire · CSM" };

export default async function Page() {
  await requirePermission("repertoire:read");
  return <ComingSoon title="Annuaire" />;
}
