import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requireAdmin } from "@/server/auth";

export const metadata: Metadata = { title: "Journal d'audit · CSM" };

export default async function Page() {
  // Garde dans la page (pas seulement le layout) : Next rend layout et page en parallèle.
  await requireAdmin();
  return <ComingSoon title="Journal d'audit" />;
}
