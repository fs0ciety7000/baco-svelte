// Zones SPI (ex-zones COI) : rattachement de chaque gare / PANG et de chaque PN à une zone. Pur et testé (`spi.test.ts`).
//
// Ordre de décision pour une gare (la zone choisie à la main n'est jamais recalculée) :
//   1. « carte » : zone relevée sur la carte « Répartition des PtCars en zones COI » (28/06/2023, document interne gardé
//      hors du dépôt ; seul le résultat gare → zone est versionné : `data/spi-zone-seed.json`) ;
//   2. « graphe » : zone de la gare rattachée la plus proche LE LONG des lignes (`rail_lines` : gares consécutives d'une
//      ligne reliées, distance à vol d'oiseau entre elles), à 25 km de voie au plus ;
//   3. « proximite » : gare rattachée la plus proche à vol d'oiseau, en préférant une gare d'une ligne commune (15 km).
// Un PN prend la zone de la gare rattachée la plus proche de SA ligne, sinon de la plus proche tout court (30 km).

import { hasPosition, haversineKm, type LatLon } from "./geo";

export const SPI_SOURCES = ["carte", "graphe", "proximite", "manuel"] as const;
export type SpiSource = (typeof SPI_SOURCES)[number];

export const SPI_SOURCE_LABEL: Record<SpiSource, string> = {
  carte: "Carte des zones",
  graphe: "Le long des lignes",
  proximite: "Gare la plus proche",
  manuel: "Choisie à la main",
};

/** Zones de la carte du 28/06/2023 et districts donnés par l'utilisateur (copie de la migration 1760004800). */
export const SPI_ZONE_DISTRICT: Record<string, string> = {
  LT: "DSE",
  LL: "DSE",
  GV: "DSE",
  FNR: "DSE",
  FL: "DSE",
  LRB: "DSE",
  FCR: "DSO",
  FTY: "DSO",
  FMS: "DSO",
  FBMZ: "DCE",
  FBN: "DCE",
  FGSP: "DNO",
  LK: "DNO",
  FDD: "DNO",
  FR: "DNO",
  FN: "DNE",
  FM: "DNE",
  FLV: "DNE",
  FHS: "DNE",
};

export type ZoneStation = {
  key: string;
  name: string;
  lat: number;
  lon: number;
  lines: string[];
  zone: string;
  source: string;
  kind?: string;
};

export type ZoneLine = {
  line: string;
  stations: { n: string; b?: number; g?: number; km?: number }[];
  branches?: { b: number; from: string }[];
};

export type ZoneAssignment = { zone: string; source: SpiSource | "" };

const GRAPH_MAX_KM = 25;
const NEAR_LINE_KM = 15;
const NEAR_ANY_KM = 30;

/** Arêtes des lignes : gares consécutives du tronc et de chaque embranchement (pas à travers un trou kilométrique). */
export function lineGraph(lines: ZoneLine[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!a || !b || a === b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  for (const l of lines) {
    const seq = new Map<number, string[]>();
    for (const s of l.stations ?? []) {
      const b = typeof s.b === "number" ? s.b : 0;
      const list = seq.get(b) ?? [];
      if (list.length && !s.g) link(list[list.length - 1]!, s.n);
      list.push(s.n);
      seq.set(b, list);
    }
    for (const br of l.branches ?? []) {
      const first = seq.get(br.b)?.[0];
      if (first) link(br.from, first);
    }
  }
  return adj;
}

/**
 * Zone de chaque gare. `seed` : clé de gare → zone relevée sur la carte. `zones` : codes valides. Rend une entrée par gare
 * (zone vide si rien n'a pu être déduit) ; une zone manuelle est rendue telle quelle.
 */
export function assignStationZones(
  stations: ZoneStation[],
  lines: ZoneLine[],
  seed: Record<string, string>,
  zones: string[],
): Map<string, ZoneAssignment> {
  const valid = new Set(zones);
  const out = new Map<string, ZoneAssignment>();
  const byName = new Map<string, ZoneStation>();
  for (const s of stations) if (!byName.has(s.name)) byName.set(s.name, s);

  for (const s of stations) {
    if (s.source === "manuel" && valid.has(s.zone)) out.set(s.key, { zone: s.zone, source: "manuel" });
    else if (valid.has(seed[s.key] ?? "")) out.set(s.key, { zone: seed[s.key]!, source: "carte" });
  }

  // Graphe : Dijkstra multi-sources (gares déjà rattachées), poids = distance entre gares consécutives.
  const adj = lineGraph(lines);
  const dist = new Map<string, number>();
  const zoneOf = new Map<string, string>();
  const queue: { name: string; d: number }[] = [];
  for (const s of stations) {
    const a = out.get(s.key);
    if (a && adj.has(s.name)) {
      dist.set(s.name, 0);
      zoneOf.set(s.name, a.zone);
      queue.push({ name: s.name, d: 0 });
    }
  }
  const weight = (a: string, b: string) => {
    const sa = byName.get(a);
    const sb = byName.get(b);
    return sa && sb && hasPosition(sa) && hasPosition(sb) ? haversineKm(sa, sb) : 3;
  };
  while (queue.length) {
    // File triée à la main : quelques centaines de nœuds, inutile d'écrire un tas.
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i]!.d < queue[bi]!.d) bi = i;
    const { name, d } = queue.splice(bi, 1)[0]!;
    if (d > (dist.get(name) ?? Infinity)) continue;
    for (const next of adj.get(name) ?? []) {
      const nd = d + weight(name, next);
      if (nd > GRAPH_MAX_KM || nd >= (dist.get(next) ?? Infinity)) continue;
      dist.set(next, nd);
      zoneOf.set(next, zoneOf.get(name)!);
      queue.push({ name: next, d: nd });
    }
  }
  for (const s of stations) {
    if (out.has(s.key)) continue;
    const z = zoneOf.get(s.name);
    if (z && byName.get(s.name) === s) out.set(s.key, { zone: z, source: "graphe" });
  }

  // Proximité : gare rattachée la plus proche (ligne commune d'abord).
  const anchors = stations.filter((s) => out.has(s.key) && hasPosition(s));
  for (const s of stations) {
    if (out.has(s.key)) continue;
    if (!hasPosition(s) || s.kind === "etranger") {
      out.set(s.key, { zone: "", source: "" });
      continue;
    }
    const z = nearestZone(s, anchors, out, s.lines);
    out.set(s.key, z ? { zone: z, source: "proximite" } : { zone: "", source: "" });
  }
  return out;
}

function nearestZone(
  p: LatLon,
  anchors: ZoneStation[],
  zones: Map<string, ZoneAssignment>,
  lines: string[],
): string {
  let line: { d: number; z: string } | null = null;
  let any: { d: number; z: string } | null = null;
  const own = new Set(lines);
  for (const a of anchors) {
    const z = zones.get(a.key)?.zone;
    if (!z) continue;
    const d = haversineKm(p, a);
    if (d <= NEAR_LINE_KM && a.lines.some((l) => own.has(l)) && (!line || d < line.d)) line = { d, z };
    if (d <= NEAR_ANY_KM && (!any || d < any.d)) any = { d, z };
  }
  return line?.z ?? any?.z ?? "";
}

/** « L.96 » / « 96 » → « 96 » (clé des lignes du référentiel). */
export const lineKey = (line: string) => line.replace(/^L\.?\s*/i, "").toUpperCase();

/**
 * Zone d'un PN : gare rattachée la plus proche parmi celles de SA ligne (à 20 km au plus), sinon la plus proche tout
 * court (30 km). `stations` = gares avec leur zone (après `assignStationZones`).
 */
export function crossingZone(
  pn: LatLon & { line: string },
  stations: { lat: number; lon: number; lines: string[]; zone: string }[],
): string {
  if (!hasPosition(pn)) return "";
  const key = lineKey(pn.line);
  let line: { d: number; z: string } | null = null;
  let any: { d: number; z: string } | null = null;
  for (const s of stations) {
    if (!s.zone || !hasPosition(s)) continue;
    const d = haversineKm(pn, s);
    if (d <= 20 && s.lines.includes(key) && (!line || d < line.d)) line = { d, z: s.zone };
    if (d <= NEAR_ANY_KM && (!any || d < any.d)) any = { d, z: s.zone };
  }
  return line?.z ?? any?.z ?? "";
}

/** Districts couverts par des zones : DSO → [FCR, FTY, FMS]… (filtre « district » de la Carte PN). */
export function zonesOfDistricts(
  districts: string[],
  zones: { code: string; district: string }[],
): Set<string> {
  const want = new Set(districts);
  return new Set(zones.filter((z) => want.has(z.district)).map((z) => z.code));
}
