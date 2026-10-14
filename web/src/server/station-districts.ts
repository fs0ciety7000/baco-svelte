import "server-only";

import { setDistrictOverrides } from "@/lib/pmr/districts";
import { env } from "@/server/env";

// Districts du référentiel des gares (collection `stations`, modifiable dans Ressources › Gares), relus toutes les 10 min
// par la route interne PocketBase et appliqués à `districtForStation` (ingestion DICOS : district des missions et
// groupes). Sans secret interne ou en cas d'erreur : table figée seule.

const TTL = 10 * 60_000;
const g = globalThis as { __csmStationDistricts?: { at: number } };

export async function loadStationDistricts(): Promise<void> {
  if (env.CSM_INTERNAL_SECRET.length < 32) return;
  if (g.__csmStationDistricts && Date.now() - g.__csmStationDistricts.at < TTL) return;
  try {
    const res = await fetch(`${env.PB_URL.replace(/\/$/, "")}/api/csm/stations/districts`, {
      headers: { "x-csm-internal": env.CSM_INTERNAL_SECRET },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return;
    const body = (await res.json()) as {
      items?: { names: string[]; abbr?: string; district: string; manual?: boolean }[];
    };
    const items = body.items ?? [];
    if (items.length) setDistrictOverrides(items);
    g.__csmStationDistricts = { at: Date.now() };
  } catch {
    // Table figée en repli.
  }
}

/** À appeler après une modification de district (prise en compte immédiate). */
export function invalidateStationDistricts() {
  g.__csmStationDistricts = undefined;
}
