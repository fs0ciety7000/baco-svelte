// Passages à niveau des données ouvertes Infrabel (jeu « geoow », « Lijst en geografische positie van de overwegen »,
// licence CC0) : lecture d'une ligne du fichier, rapprochement avec les PN déjà connus de CSM (repris de BACO ou saisis
// par l'équipe) et borne kilométrique estimée le long de la ligne. Pur et testé (`crossings.test.ts`).
//
// Le fichier Infrabel ne donne pas la BK : seulement le nom Ramses (« L-36-14 » = ligne 36, PN 14), la commune, le type
// de signalisation et la position. Les PN des zones portuaires (« Antwerpen-DS-… », sans ligne) sont ignorés.

import { hasPosition, haversineKm, projectOnSegment, toLocal, type LatLon, type Pt } from "./geo";

export type InfrabelCrossing = {
  infrabelId: string;
  /** « L.36 » (format de `level_crossings.line`). */
  line: string;
  /** « 14 », « 3 bis », « 12A » (format de `level_crossings.number`). */
  number: string;
  lat: number;
  lon: number;
  commune: string;
  signal: string;
};

export type KnownCrossing = {
  id: string;
  line: string;
  number: string;
  lat: number;
  lon: number;
  infrabelId?: string;
};

const RAMSES = /^L-(\d{1,3}[A-Z]?)-(\d{1,4})([A-Z]{0,8})$/;

/** Suffixe Infrabel → numéro CSM : « BIS » → « 3 bis », « TER » → « 3 ter », lettres gardées (« 12A »). */
export function crossingNumber(digits: string, suffix: string): string {
  const n = String(parseInt(digits, 10));
  if (suffix === "BIS") return `${n} bis`;
  if (suffix === "TER") return `${n} ter`;
  return `${n}${suffix}`;
}

/** Clé de rapprochement d'un numéro : « 5 bis », « 5Bis » et « 5BIS » se valent. */
export function numberKey(number: string): string {
  return number.toLowerCase().replace(/\s+/g, "");
}

/** « 4257 CORSWAREM (BERLOZ) » → « 4257 Corswarem (Berloz) ». */
export function prettyCommune(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/(^|[\s(\-'])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
    .slice(0, 120);
}

const num = (v: string | undefined) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

/** Une ligne du CSV Infrabel (colonnes en minuscules) → PN, ou null (zone portuaire, position absente…). */
export function parseInfrabelCrossing(row: Record<string, string>): InfrabelCrossing | null {
  const id = (row.fld_naam_ramses ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const m = RAMSES.exec(id);
  if (!m) return null;
  let lat = num(row.fld_geo_y);
  let lon = num(row.fld_geo_x);
  if (!(lat > 0)) {
    const pos = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/.exec(
      row.position_du_passage_a_niveau ?? "",
    );
    if (pos) {
      lat = num(pos[1]);
      lon = num(pos[2]);
    }
  }
  if (!hasPosition({ lat, lon })) return null;
  return {
    infrabelId: id,
    line: `L.${m[1]}`,
    number: crossingNumber(m[2]!, m[3] ?? ""),
    lat: Math.round(lat * 1e6) / 1e6,
    lon: Math.round(lon * 1e6) / 1e6,
    commune: prettyCommune(row.fld_postcode_en_gemeente ?? ""),
    signal: (row.type_pn ?? "").trim().slice(0, 80),
  };
}

export type CrossingMatch = {
  /** n° Infrabel → identifiant du PN CSM rapproché. */
  byInfrabel: Map<string, string>;
  /** Comment chaque PN a été rapproché. */
  how: Map<string, "id" | "numero" | "proximite">;
};

/**
 * Rapprochement Infrabel ↔ PN connus : 1) n° Infrabel déjà posé ; 2) même ligne et même numéro ; 3) même ligne, à moins
 * de `maxKm` (PN renuméroté ou mal saisi), le plus proche d'abord. Un PN connu n'est rapproché qu'une fois.
 */
export function matchCrossings(
  known: KnownCrossing[],
  infra: InfrabelCrossing[],
  maxKm = 0.15,
): CrossingMatch {
  const byInfrabel = new Map<string, string>();
  const how = new Map<string, "id" | "numero" | "proximite">();
  const used = new Set<string>();
  const take = (i: InfrabelCrossing, k: KnownCrossing, h: "id" | "numero" | "proximite") => {
    byInfrabel.set(i.infrabelId, k.id);
    how.set(i.infrabelId, h);
    used.add(k.id);
  };
  const byId = new Map(known.filter((k) => k.infrabelId).map((k) => [k.infrabelId!, k]));
  for (const i of infra) {
    const k = byId.get(i.infrabelId);
    if (k && !used.has(k.id)) take(i, k, "id");
  }
  const byNumber = new Map<string, KnownCrossing>();
  for (const k of known) {
    if (used.has(k.id)) continue;
    const key = `${k.line}|${numberKey(k.number)}`;
    if (!byNumber.has(key)) byNumber.set(key, k);
  }
  for (const i of infra) {
    if (byInfrabel.has(i.infrabelId)) continue;
    const k = byNumber.get(`${i.line}|${numberKey(i.number)}`);
    if (k && !used.has(k.id)) take(i, k, "numero");
  }
  // Proximité : toutes les paires candidates, de la plus proche à la plus lointaine.
  const pairs: { d: number; i: InfrabelCrossing; k: KnownCrossing }[] = [];
  for (const i of infra) {
    if (byInfrabel.has(i.infrabelId)) continue;
    for (const k of known) {
      if (used.has(k.id) || k.line !== i.line || !hasPosition(k)) continue;
      const d = haversineKm(i, k);
      if (d <= maxKm) pairs.push({ d, i, k });
    }
  }
  pairs.sort((a, b) => a.d - b.d);
  for (const { i, k } of pairs) {
    if (byInfrabel.has(i.infrabelId) || used.has(k.id)) continue;
    take(i, k, "proximite");
  }
  return { byInfrabel, how };
}

export type KmPoint = LatLon & { km: number };

/**
 * BK estimée d'un point le long d'une ligne : la ligne est approchée par la suite de ses gares (positions connues) ; la
 * BK est interpolée entre les deux gares à points kilométriques connus qui encadrent la projection du point (distances
 * cumulées à vol d'oiseau, recalées sur les km Infrabel). Au-delà de la dernière gare connue : prolongée de 5 km au plus.
 * `null` si le point est à plus de `maxKm` du tracé ou si la ligne n'a pas deux gares à km connus.
 */
export function estimateBk(
  point: LatLon,
  stations: (LatLon & { km?: number | null })[],
  maxKm = 3,
): number | null {
  const pts = stations.filter((s): s is LatLon & { km?: number | null } => hasPosition(s));
  if (pts.length < 2) return null;
  const local = pts.map((s) => toLocal(s));
  const cum: number[] = [0];
  for (let i = 1; i < local.length; i++)
    cum.push(
      cum[i - 1]! + Math.hypot(local[i]![0] - local[i - 1]![0], local[i]![1] - local[i - 1]![1]),
    );
  const known = pts
    .map((s, i) => ({ i, km: typeof s.km === "number" ? s.km : null }))
    .filter((k): k is { i: number; km: number } => k.km !== null);
  if (known.length < 2) return null;
  const p: Pt = toLocal(point);
  let best = { dist: Infinity, along: 0 };
  for (let i = 0; i + 1 < local.length; i++) {
    const { t, dist } = projectOnSegment(p, local[i]!, local[i + 1]!);
    if (dist < best.dist) best = { dist, along: cum[i]! + t * (cum[i + 1]! - cum[i]!) };
  }
  // Prolongement au-delà des extrémités : projection sur la droite du premier / dernier segment.
  const extend = (a: Pt, b: Pt, base: number, sign: 1 | -1) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const along = ((p[0] - b[0]) * dx + (p[1] - b[1]) * dy) / len;
    if (along <= 0 || along > 5) return;
    const dist = Math.abs((p[0] - b[0]) * dy - (p[1] - b[1]) * dx) / len;
    if (dist < best.dist) best = { dist, along: base + sign * along };
  };
  const n = local.length;
  extend(local[n - 2]!, local[n - 1]!, cum[n - 1]!, 1);
  extend(local[1]!, local[0]!, 0, -1);
  if (best.dist > maxKm) return null;
  // Encadrement par les gares à km connus (ou les deux plus proches à une extrémité).
  let lo = known[0]!;
  let hi = known[1]!;
  for (let k = 0; k + 1 < known.length; k++) {
    lo = known[k]!;
    hi = known[k + 1]!;
    if (best.along <= cum[hi.i]!) break;
  }
  const span = cum[hi.i]! - cum[lo.i]!;
  if (span <= 0) return null;
  const km = lo.km + ((best.along - cum[lo.i]!) / span) * (hi.km - lo.km);
  return km > 0 && km < 1000 ? Math.round(km * 1000) / 1000 : null;
}

// --- BK par les bornes kilométriques Infrabel ------------------------------------------------------------------
// Jeu « relatie-tussen-kilometerpalen-en-lijnen » (CC0, ≈ 6 000 bornes : n° de ligne, km de la borne, position). La BK
// d'un PN est interpolée entre les deux bornes consécutives de SA ligne qui l'encadrent (une borne par km) : écart
// médian de 5 m, 90 % sous 100 m contre les BK relevées de BACO. Repli : `estimateBk` (gares, « ≈ »).

export type KmPost = LatLon & { km: number };

/** Lignes du CSV des bornes → ligne (« 94 », « 90C ») → bornes triées par km (positions des voies moyennées). */
export function kmPostsFrom(rows: Iterable<Record<string, string>>): Map<string, KmPost[]> {
  const acc = new Map<string, Map<number, { lat: number; lon: number; n: number }>>();
  for (const r of rows) {
    const line = (r.linecalfa ?? "").trim().toUpperCase();
    const name = (r.name ?? "").trim();
    if (!/^\d{1,3}[A-Z]?$/.test(line) || !/^\d{1,3}$/.test(name)) continue;
    const pos = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/.exec(r.geo_point_2d ?? "");
    if (!pos) continue;
    const lat = Number(pos[1]);
    const lon = Number(pos[2]);
    if (!hasPosition({ lat, lon })) continue;
    const km = Number(name);
    const byKm = acc.get(line) ?? new Map<number, { lat: number; lon: number; n: number }>();
    const cur = byKm.get(km) ?? { lat: 0, lon: 0, n: 0 };
    cur.lat += lat;
    cur.lon += lon;
    cur.n++;
    byKm.set(km, cur);
    acc.set(line, byKm);
  }
  const out = new Map<string, KmPost[]>();
  for (const [line, byKm] of acc)
    out.set(
      line,
      [...byKm.entries()]
        .map(([km, v]) => ({ km, lat: v.lat / v.n, lon: v.lon / v.n }))
        .sort((a, b) => a.km - b.km),
    );
  return out;
}

/**
 * BK d'un point entre les bornes de sa ligne : segment entre deux bornes consécutives (2 km d'écart au plus) le plus
 * proche, km interpolé. `null` si le point est à plus de `maxKm` de tout segment (PN mal placé, ligne sans bornes).
 */
export function bkFromPosts(point: LatLon, posts: KmPost[], maxKm = 0.3): number | null {
  if (posts.length < 2 || !hasPosition(point)) return null;
  const p = toLocal(point);
  let best: { dist: number; km: number } | null = null;
  for (let i = 0; i + 1 < posts.length; i++) {
    const a = posts[i]!;
    const b = posts[i + 1]!;
    if (b.km - a.km > 2) continue;
    const { t, dist } = projectOnSegment(p, toLocal(a), toLocal(b));
    if (!best || dist < best.dist) best = { dist, km: a.km + t * (b.km - a.km) };
  }
  if (!best || best.dist > maxKm) return null;
  return Math.round(best.km * 1000) / 1000;
}
