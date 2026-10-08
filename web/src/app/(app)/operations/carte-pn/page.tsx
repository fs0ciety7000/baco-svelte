import type { Metadata } from "next";

import { PnBoard } from "@/components/ops/pn-board";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { listCrossings, listDepots } from "@/server/data/ops";

import { LiveRefresh } from "../../commandes/live-refresh";

export const metadata: Metadata = { title: "Carte PN · CSM" };

export default async function Page() {
  const user = await requirePermission("carte_pn:read");
  const [crossings, depots] = await Promise.all([listCrossings(), listDepots()]);
  return (
    <section className="flex flex-col gap-3" aria-label="Carte des passages à niveau">
      <div className="flex justify-end">
        <LiveRefresh topics={["level_crossings"]} />
      </div>
      <PnBoard
        crossings={crossings}
        depots={depots}
        canEdit={can(user, "carte_pn:write")}
        canWriteLog={can(user, "journal:read")}
      />
    </section>
  );
}
