import type { Metadata } from "next";

import { LiveBoard } from "@/components/ops/live-board";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { districtStations, favoritesOf, listWatches } from "@/server/data/ops";

export const metadata: Metadata = { title: "Trains en direct · CSM" };

export default async function Page() {
  const user = await requirePermission("live:read");
  const [watches, stations] = await Promise.all([
    listWatches(user.id),
    districtStations(user.district),
  ]);
  return (
    <section aria-label="Trains en direct">
      <LiveBoard
        favorites={favoritesOf(user.preferences)}
        watches={watches}
        districtStations={stations}
        canOrderBus={can(user, "otto:write")}
        canWriteLog={can(user, "journal:write")}
      />
    </section>
  );
}
