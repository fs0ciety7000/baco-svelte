import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requireRoute } from "@/server/auth";

export const metadata: Metadata = { title: "Nouveautés · CSM" };

export default async function Page() {
  await requireRoute("/equipe/nouveautes");
  return <ComingSoon title="Nouveautés" />;
}
