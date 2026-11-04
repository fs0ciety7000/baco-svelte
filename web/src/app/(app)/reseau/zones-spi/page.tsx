import type { Metadata } from "next";

import { AdminEditLink } from "@/components/referentiels/ref-ui";
import { SpiZonesView } from "@/components/referentiels/spi-zones-view";
import { can } from "@/lib/permissions";
import { requireRoute } from "@/server/auth";
import { crossingZoneCounts, listSpiZones, listZoneStations } from "@/server/data/network";

export const metadata: Metadata = { title: "Zones SPI · CSM" };

/**
 * Réseau › Zones SPI (4 nov. 2026) : consultation des 19 zones (district, gares et PANG rattachés, PN), carte des zones et
 * gares par zone. Copie en lecture d'Administration › Référentiels › Zones SPI, où se font les rattachements
 * (`referentiels:manage`). Nombre de PN et lien vers la Carte PN avec `carte_pn:read`.
 */
export default async function Page() {
  const user = await requireRoute("/reseau/zones-spi");
  const canPn = can(user, "carte_pn:read");
  const [zones, stations, pn] = await Promise.all([
    listSpiZones(),
    listZoneStations().catch(() => []),
    canPn ? crossingZoneCounts().catch(() => null) : Promise.resolve(null),
  ]);
  return (
    <SpiZonesView
      zones={zones}
      stations={stations.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        lat: s.lat,
        lon: s.lon,
        district: s.district,
        lines: s.lines,
        zone: s.zone,
        source: s.source,
      }))}
      pnCounts={pn}
      adminLink={
        <AdminEditLink
          href="/admin/referentiels/zones-spi"
          show={can(user, "referentiels:manage")}
        />
      }
    />
  );
}
