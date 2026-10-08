import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requireRoute } from "@/server/auth";

export const metadata: Metadata = { title: "Annuaire de l'équipe · CSM" };

export default async function Page() {
  await requireRoute("/equipe/annuaire");
  return <ComingSoon title="Annuaire de l'équipe" />;
}
