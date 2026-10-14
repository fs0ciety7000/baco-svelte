import type { Metadata } from "next";

import { SpiZonesAdmin } from "@/components/admin/referentiels/spi-zones-admin";
import { SPI_SOURCE_LABEL, type SpiSource } from "@/lib/network/spi";
import { requirePermission } from "@/server/auth";
import { listSpiZones, listZoneStations } from "@/server/data/network";
import { timetableState } from "@/server/data/timetable";

export const metadata: Metadata = { title: "Zones SPI · Référentiels · CSM" };

/**
 * Administration › Référentiels › Zones SPI (15 oct. 2026) : zones dessinées sur la carte, rattachement des gares et
 * PANG (une par une ou en masse), fiches des zones, recalcul et import des PN Infrabel. `referentiels:manage`.
 */
export default async function Page() {
  await requirePermission("referentiels:manage");
  const [zones, stations, status] = await Promise.all([
    listSpiZones(),
    listZoneStations(),
    timetableState().catch(() => null),
  ]);
  const by = new Map<string, number>();
  for (const s of stations) by.set(s.source || "", (by.get(s.source || "") ?? 0) + 1);
  const summary = [
    ...(Object.keys(SPI_SOURCE_LABEL) as SpiSource[])
      .filter((k) => by.get(k))
      .map((k) => `${SPI_SOURCE_LABEL[k]} : ${by.get(k)}`),
    ...(by.get("") ? [`Sans zone : ${by.get("")}`] : []),
  ];
  const c = status?.network?.crossings;
  if (c)
    summary.push(
      `PN Infrabel : ${c.infrabel} (${c.matched} rapprochés de PN connus, BK : ${c.bkPosts ?? 0} par les bornes, ${c.bkEstimated} estimées ; ${c.retired ?? 0} PN BACO absents désactivés)`,
    );
  return <SpiZonesAdmin zones={zones} stations={stations} summary={summary} />;
}
