import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TvBoard } from "@/components/ops/tv-board";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { buildHandover, handoverDistricts } from "@/server/data/handover";

import { LiveRefresh } from "../(app)/commandes/live-refresh";

export const metadata: Metadata = { title: "Écran commun · CSM" };
export const dynamic = "force-dynamic";

/**
 * Écran commun du bureau (demande du 10 oct. 2026) : grand tableau de bord plein écran, sans menus, rafraîchi en direct.
 * Écran partagé : AUCUN nom de voyageur (même synthèse que la relève). `?district=DSO|DSE|DCE|tous`.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ district?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "journal:read")) notFound();
  const { district } = await searchParams;
  const codes = handoverDistricts(user, district);
  const data = await buildHandover(user, codes);
  return (
    <main className="min-h-dvh bg-bg p-4 text-fg md:p-6" data-testid="tv">
      <TvBoard data={data} scope={codes.length ? codes.join(" · ") : "Tous districts"} />
      <div className="fixed right-4 bottom-3 opacity-70">
        <LiveRefresh
          topics={[
            "bus_orders",
            "taxi_orders",
            "pmr_assists",
            "group_missions",
            "ops_log",
            "mission_trains",
            "alea_marks",
          ]}
        />
      </div>
    </main>
  );
}
