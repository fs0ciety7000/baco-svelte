import type { Metadata } from "next";

import { PnBoard } from "@/components/ops/pn-board";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { listSpiZones } from "@/server/data/network";
import { listCrossings, listDepots } from "@/server/data/ops";

import { LiveRefresh } from "../../commandes/live-refresh";

export const metadata: Metadata = { title: "Carte PN · CSM" };

/**
 * Réseau › Carte PN (refonte du 15 oct. 2026) : PN Infrabel (données ouvertes, importés chaque matin) et PN de l'équipe,
 * filtres district / zone SPI / ligne / recherche, couche « Zones SPI ». Droits `carte_pn:*` inchangés.
 */
export default async function Page() {
  const user = await requirePermission("carte_pn:read");
  const [crossings, depots, zones] = await Promise.all([
    listCrossings(),
    listDepots(),
    listSpiZones(),
  ]);
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="Carte des passages à niveau">
      <div className="flex justify-end">
        <LiveRefresh topics={["level_crossings"]} />
      </div>
      <PnBoard
        crossings={crossings}
        zones={zones}
        depots={depots}
        canEdit={can(user, "carte_pn:write") && can(user, "carte_pn:update")}
        canReadLog={can(user, "journal:read")}
      />
    </section>
  );
}
