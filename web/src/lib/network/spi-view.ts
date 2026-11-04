import { foldStation } from "@/lib/stations/search";

// Réseau › Zones SPI (consultation, 4 nov. 2026) : comptages par zone et filtre des gares, logique pure partagée par
// l'écran en lecture. L'écriture reste dans Administration › Référentiels › Zones SPI.

export type ZoneStationLike = { name: string; kind: string; lines: string[]; zone: string };

/** Valeur du filtre « Sans zone ». */
export const NO_ZONE = "aucune";

export type ZoneTally = { stations: number; gares: number; pang: number };

/** Gares et PANG par code de zone (« » = sans zone ; les points étrangers comptent comme gares). */
export function tallyZones(stations: ZoneStationLike[]): Map<string, ZoneTally> {
  const out = new Map<string, ZoneTally>();
  for (const s of stations) {
    const k = s.zone || "";
    const t = out.get(k) ?? { stations: 0, gares: 0, pang: 0 };
    t.stations++;
    if (s.kind === "pang") t.pang++;
    else t.gares++;
    out.set(k, t);
  }
  return out;
}

/** Nombre de PN actifs par code de zone (« » = sans zone). */
export function countByZone(items: { zone: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) {
    const k = i.zone || "";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/**
 * Gares d'une zone (`zone` vide = toutes, `NO_ZONE` = sans zone) qui répondent à la recherche : nom (accents et casse
 * ignorés) ou numéro de ligne (« 96 », « L.96 », « L96 »).
 */
export function filterZoneStations<T extends ZoneStationLike>(
  stations: T[],
  { q, zone }: { q: string; zone: string },
): T[] {
  const f = foldStation(q);
  const line = /^l?\s*\.?\s*(\d{1,3}[a-z]?)$/i.exec(q.trim())?.[1]?.toUpperCase() ?? "";
  return stations.filter((s) => {
    if (zone === NO_ZONE ? s.zone : zone && s.zone !== zone) return false;
    if (!f) return true;
    if (line && s.lines.some((l) => l.toUpperCase() === line)) return true;
    return foldStation(s.name).includes(f);
  });
}

/** Lien vers la Carte PN filtrée sur une zone, couche des zones affichée. */
export function pnMapHref(zone: string): string {
  return `/reseau/pn?${new URLSearchParams({ zone, zones: "1" })}`;
}
