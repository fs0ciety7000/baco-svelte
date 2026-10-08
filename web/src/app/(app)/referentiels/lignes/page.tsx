import type { Metadata } from "next";

import { ComingSoon } from "@/components/shell/coming-soon";
import { requireRoute } from "@/server/auth";

export const metadata: Metadata = { title: "Lignes · CSM" };

export default async function Page() {
  await requireRoute("/referentiels/lignes");
  return <ComingSoon title="Lignes" />;
}
