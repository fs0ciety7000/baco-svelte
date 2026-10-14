import type { Metadata } from "next";

import { StationsScreen } from "@/components/referentiels/stations-screen";
import { can } from "@/lib/permissions";
import { requireRoute } from "@/server/auth";

export const metadata: Metadata = { title: "Gares · CSM" };

// Réseau › Gares : consultation pour tous ; district, lignes et type modifiables avec `referentiels:manage` (admin, sysop
// ou rôle qui la reçoit, décision du 14 oct. 2026). Même écran dans Administration › Référentiels › Gares et districts.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRoute("/reseau/gares");
  return (
    <StationsScreen
      raw={await searchParams}
      action="/reseau/gares"
      canEdit={can(user, "referentiels:manage")}
    />
  );
}
