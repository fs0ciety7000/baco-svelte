// Gares de chaque ligne d'infrastructure, dans l'ordre (Ressources › Lignes, 14 oct. 2026), tirées du référentiel des
// trains au lieu de la table BACO `line_stations` (36 lignes du sud seulement, ordre saisi à la main).
//
// Méthode (pure, testée) :
//  1. Chemins Infrabel (`train_paths`, tous les trains vus sur 60 jours) : chaque paire de gares CONSÉCUTIVES d'un train
//     est une arête de la ligne empruntée au départ de la première (`l`). Un chemin Infrabel liste toutes les gares
//     traversées, arrêt ou non : un train rapide ne crée donc pas de raccourci. Poids d'une arête = nombre de trains.
//  2. Bruit écarté : sur une ligne fréquentée (≥ 20 trains sur son arête la plus chargée), une arête vue par moins de 3 trains
//     (ou 2 % du maximum) est ignorée (détournement, courbe de raccordement isolée).
//  3. Raccourcis retirés : arête la moins chargée d'abord, retirée s'il existe un autre chemin court (≤ 8 gares) entre ses deux
//     gares (gare non enregistrée un jour, parcours sur une ligne parallèle comptée sous le même n°). Il reste une forêt.
//  4. Tronc = chemin le plus « chargé » de l'arbre (somme des poids, double parcours : exact sur un arbre) ; les gares hors
//     tronc forment des embranchements, listés après le tronc depuis la gare de bifurcation vers l'extérieur ; un morceau non
//     relié (rare) suit comme tronçon séparé.
//  5. Sens : celui des points kilométriques Infrabel (« lijnsecties », CC0) si au moins deux gares du tronc en ont un
//     (km croissants) ; sinon ordre alphabétique des deux extrémités (stable d'un jour à l'autre).
//  6. Seules les gares voyageurs sont rendues (les points « -Garage » servent au calcul, pas à l'affichage).

import { foldStation } from "@/lib/stations/search";

import { lineNorm } from "./model";

/** Point d'un chemin Infrabel (sous-ensemble de `TrainPath["points"]`). */
export type PathPoint = { n: string; l: string };

/** Section de ligne Infrabel : n° de ligne, abréviations PtCar des extrémités, points kilométriques (mètres). */
export type LineSection = { line: string; from: string; to: string; mFrom: number; mTo: number };

/**
 * Gare d'une ligne : nom, abréviation PtCar, point kilométrique (km), n° d'embranchement (0 / absent = tronc), `g` = le
 * tronc reprend ici après un trou (section parcourue sous un autre n° de ligne).
 */
export type RailLineStation = { n: string; a?: string; km?: number; b?: number; g?: 1 };
/** Embranchement : n°, gare de bifurcation (vide = tronçon séparé), dernière gare. */
export type RailLineBranch = { b: number; from: string; to: string };

export type RailLine = {
  line: string;
  /** « Bruxelles-Midi – Quévy » (extrémités du tronc). */
  name: string;
  stations: RailLineStation[];
  branches: RailLineBranch[];
  /** Sens donné par les points kilométriques Infrabel. */
  oriented: boolean;
};

export type StationInfo = { abbr: string; served: boolean };

export type LineOptions = {
  /** Gare connue du référentiel (abréviation, desservie) ; sans fonction, toutes les gares sont rendues. */
  station?: (name: string) => StationInfo | undefined;
  /** Sections Infrabel (sens et points kilométriques). */
  sections?: LineSection[];
};

const MAX_DETOUR = 8;

type Edge = { a: string; b: string; w: number };

/** Sections Infrabel (CSV « lijnsecties ») ; seules les sections du tronc d'une ligne (« 96 », pas « 96/1 ») servent. */
export function sectionsFrom(rows: Iterable<Record<string, string>>): LineSection[] {
  const out: LineSection[] = [];
  for (const r of rows) {
    const raw = String(r.label ?? "")
      .replace(/\(.*?\)/g, "")
      .trim()
      .toUpperCase();
    if (!raw || raw.includes("/")) continue;
    const from = String(r.symnamefrom ?? "")
      .trim()
      .toUpperCase();
    const to = String(r.symnameto ?? "")
      .trim()
      .toUpperCase();
    const mFrom = Number(r.mfrom);
    const mTo = Number(r.mto);
    if (!from || !to || !Number.isFinite(mFrom) || !Number.isFinite(mTo)) continue;
    out.push({ line: lineNorm(raw), from, to, mFrom, mTo });
  }
  return out;
}

/** Point kilométrique (km, 1 décimale) de chaque abréviation sur une ligne. */
function kmIndex(sections: LineSection[] | undefined): Map<string, Map<string, number>> {
  const by = new Map<string, Map<string, number>>();
  for (const s of sections ?? []) {
    const m = by.get(s.line) ?? new Map<string, number>();
    if (!m.has(s.from)) m.set(s.from, Math.round(s.mFrom / 100) / 10);
    if (!m.has(s.to)) m.set(s.to, Math.round(s.mTo / 100) / 10);
    by.set(s.line, m);
  }
  return by;
}

const edgeKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/** Arêtes par ligne : gares consécutives d'un même chemin, comptées une fois par train. */
export function lineEdges(
  paths: Iterable<{ points: PathPoint[] }>,
): Map<string, Map<string, Edge>> {
  const lines = new Map<string, Map<string, Edge>>();
  for (const p of paths) {
    const seen = new Set<string>();
    for (let i = 0; i + 1 < p.points.length; i++) {
      const u = p.points[i]!;
      const v = p.points[i + 1]!;
      const line = lineNorm(u.l);
      if (!line || !u.n || !v.n || u.n === v.n) continue;
      // Gare d'arrivée déjà sur une autre ligne (bifurcation entre les deux gares) : arête ignorée, sauf au terminus du
      // train. Une gare d'extrémité de ligne reste reliée par les trains qui en partent sur la ligne.
      const next = lineNorm(v.l);
      if (next && next !== line && i + 2 < p.points.length) continue;
      const k = edgeKey(u.n, v.n);
      if (seen.has(`${line}|${k}`)) continue;
      seen.add(`${line}|${k}`);
      const m = lines.get(line) ?? new Map<string, Edge>();
      const e = m.get(k) ?? { a: u.n < v.n ? u.n : v.n, b: u.n < v.n ? v.n : u.n, w: 0 };
      e.w++;
      m.set(k, e);
      lines.set(line, m);
    }
  }
  return lines;
}

type Adj = Map<string, Map<string, number>>;

function adjacency(edges: Edge[]): Adj {
  const adj: Adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.a)) adj.set(e.a, new Map());
    if (!adj.has(e.b)) adj.set(e.b, new Map());
    adj.get(e.a)!.set(e.b, e.w);
    adj.get(e.b)!.set(e.a, e.w);
  }
  return adj;
}

/** Vrai si `to` est joignable depuis `from` en au plus `max` arêtes (sans l'arête directe, retirée avant l'appel). */
function reachable(adj: Adj, from: string, to: string, max: number): boolean {
  let frontier = [from];
  const seen = new Set([from]);
  for (let d = 0; d < max && frontier.length; d++) {
    const next: string[] = [];
    for (const u of frontier)
      for (const v of adj.get(u)?.keys() ?? []) {
        if (v === to) return true;
        if (!seen.has(v)) {
          seen.add(v);
          next.push(v);
        }
      }
    frontier = next;
  }
  return false;
}

/** Gare la plus « loin » de `start` dans un arbre (somme des poids, puis nombre de gares), et le chemin. */
function farthest(adj: Adj, start: string, within: Set<string>): string[] {
  const prev = new Map<string, string>();
  const dist = new Map<string, [number, number]>([[start, [0, 0]]]);
  const stack = [start];
  while (stack.length) {
    const u = stack.pop()!;
    const [du, hu] = dist.get(u)!;
    for (const [v, w] of adj.get(u) ?? []) {
      if (!within.has(v) || dist.has(v)) continue;
      dist.set(v, [du + w, hu + 1]);
      prev.set(v, u);
      stack.push(v);
    }
  }
  let best = start;
  for (const [n, [d, h]] of dist) {
    const [bd, bh] = dist.get(best)!;
    if (d > bd || (d === bd && (h > bh || (h === bh && n < best)))) best = n;
  }
  const path = [best];
  while (prev.has(path[path.length - 1]!)) path.push(prev.get(path[path.length - 1]!)!);
  return path.reverse();
}

/** Composantes connexes, la plus chargée d'abord. */
function components(adj: Adj): Set<string>[] {
  const seen = new Set<string>();
  const out: { nodes: Set<string>; w: number }[] = [];
  for (const start of [...adj.keys()].sort()) {
    if (seen.has(start)) continue;
    const nodes = new Set([start]);
    const stack = [start];
    seen.add(start);
    let w = 0;
    while (stack.length) {
      const u = stack.pop()!;
      for (const [v, ww] of adj.get(u) ?? []) {
        w += ww;
        if (!seen.has(v)) {
          seen.add(v);
          nodes.add(v);
          stack.push(v);
        }
      }
    }
    out.push({ nodes, w });
  }
  return out.sort((a, b) => b.w - a.w || b.nodes.size - a.nodes.size).map((c) => c.nodes);
}

/** Ordre d'une ligne à partir de ses arêtes (étapes 2 à 5). */
export function orderLine(
  line: string,
  edgeMap: Map<string, Edge>,
  opts: LineOptions = {},
  kmByAbbr?: Map<string, number>,
): RailLine | null {
  let edges = [...edgeMap.values()];
  const maxW = Math.max(0, ...edges.map((e) => e.w));
  if (maxW >= 20) {
    const min = Math.max(3, Math.ceil(maxW * 0.02));
    edges = edges.filter((e) => e.w >= min);
  }
  // Raccourcis : arête la moins chargée d'abord (à égalité : ordre des noms, résultat stable).
  const adj = adjacency(edges);
  for (const e of [...edges].sort(
    (x, y) => x.w - y.w || x.a.localeCompare(y.a) || x.b.localeCompare(y.b),
  )) {
    adj.get(e.a)!.delete(e.b);
    adj.get(e.b)!.delete(e.a);
    if (!reachable(adj, e.a, e.b, MAX_DETOUR)) {
      adj.get(e.a)!.set(e.b, e.w);
      adj.get(e.b)!.set(e.a, e.w);
    }
  }
  if (!adj.size) return null;

  const abbrOf = (n: string) => opts.station?.(n)?.abbr ?? "";
  const kmOf = (n: string) => {
    const a = abbrOf(n);
    return a ? kmByAbbr?.get(a) : undefined;
  };

  const ordered: { n: string; b: number; g?: boolean }[] = [];
  const branches: RailLineBranch[] = [];
  const comps = components(adj);
  const placed = new Set<string>();

  /** Embranchements accrochés aux gares de `chain` (récursif), vers l'extérieur. */
  const hang = (chain: string[], within: Set<string>) => {
    for (const j of chain) {
      for (const v of [...(adj.get(j)?.keys() ?? [])].sort()) {
        if (!within.has(v) || placed.has(v)) continue;
        // Sous-arbre de v (sans repasser par les gares déjà placées).
        const sub = new Set<string>();
        const stack = [v];
        while (stack.length) {
          const u = stack.pop()!;
          if (sub.has(u)) continue;
          sub.add(u);
          for (const x of adj.get(u)?.keys() ?? [])
            if (within.has(x) && !placed.has(x) && !sub.has(x)) stack.push(x);
        }
        const path = farthest(adj, v, sub);
        const b = branches.length + 1;
        branches.push({ b, from: j, to: path[path.length - 1]! });
        for (const n of path) {
          placed.add(n);
          ordered.push({ n, b });
        }
        hang(path, sub);
      }
    }
  };

  // Chaîne principale de chaque morceau, orientée : points kilométriques croissants si connus (au moins deux gares),
  // sinon extrémités dans l'ordre alphabétique.
  const chains = comps.map((nodes) => {
    const first = farthest(adj, [...nodes].sort()[0]!, nodes);
    let chain = farthest(adj, first[first.length - 1]!, nodes);
    let known = chain.map(kmOf).filter((k): k is number => k !== undefined);
    if (known.length >= 2) {
      if (known[0]! > known[known.length - 1]!) {
        chain = chain.reverse();
        known = known.reverse();
      }
    } else if (chain[0]!.localeCompare(chain[chain.length - 1]!, "fr") > 0) chain = chain.reverse();
    const km: [number, number] | null =
      known.length >= 2 ? [known[0]!, known[known.length - 1]!] : null;
    return { nodes, chain, km };
  });
  const oriented = !!chains[0]?.km;
  // Morceaux du tronc : le plus chargé, plus ceux qui le prolongent sans chevauchement kilométrique (ligne parcourue en
  // partie sous un autre n°, ex. L.161 entre La Hulpe et Ottignies par la L.161A) ; la reprise après un trou est marquée.
  const trunk = chains.slice(0, 1);
  const apart: typeof chains = [];
  for (const c of chains.slice(1)) {
    const km = c.km;
    const fits = oriented && !!km && trunk.every((t) => km[1] < t.km![0] || km[0] > t.km![1]);
    (fits ? trunk : apart).push(c);
  }
  trunk.sort((x, y) => (x.km?.[0] ?? 0) - (y.km?.[0] ?? 0));
  trunk.forEach((seg, i) =>
    seg.chain.forEach((n, j) => {
      placed.add(n);
      ordered.push(i > 0 && j === 0 ? { n, b: 0, g: true } : { n, b: 0 });
    }),
  );
  for (const seg of trunk) hang(seg.chain, seg.nodes);
  for (const c of apart) {
    const b = branches.length + 1;
    branches.push({ b, from: "", to: c.chain[c.chain.length - 1]! });
    for (const n of c.chain) {
      placed.add(n);
      ordered.push({ n, b });
    }
    hang(c.chain, c.nodes);
  }

  // Gares voyageurs seulement ; embranchements devenus vides retirés.
  const keep = (n: string) => !opts.station || !!opts.station(n)?.served;
  const stations: RailLineStation[] = [];
  let gap = false;
  for (const o of ordered) {
    gap ||= !!o.g;
    if (!keep(o.n)) continue;
    const st: RailLineStation = { n: o.n };
    if (gap) st.g = 1;
    gap = false;
    const a = abbrOf(o.n);
    if (a) st.a = a;
    const km = kmOf(o.n);
    if (km !== undefined) st.km = km;
    if (o.b) st.b = o.b;
    stations.push(st);
  }
  if (stations.length < 2) return null;
  // Bifurcation sur un point non voyageur : gare voyageur la plus proche sur le même tronçon.
  const junction = (from: string): string => {
    if (!from || keep(from)) return from;
    const i = ordered.findIndex((o) => o.n === from);
    for (let d = 1; i >= 0 && d < ordered.length; d++)
      for (const j of [i - d, i + d]) {
        const o = ordered[j];
        if (o && o.b === ordered[i]!.b && keep(o.n)) return o.n;
      }
    return "";
  };
  const used = new Set(stations.map((s) => s.b ?? 0));
  const kept = branches
    .filter((br) => used.has(br.b))
    .map((br) => {
      const list = stations.filter((s) => s.b === br.b);
      return { b: br.b, from: junction(br.from), to: list[list.length - 1]!.n };
    });
  const main = stations.filter((s) => !s.b);
  const ends = main.length ? main : stations;
  return {
    line,
    name: `${ends[0]!.n} – ${ends[ends.length - 1]!.n}`,
    stations,
    branches: kept,
    oriented,
  };
}

/** Toutes les lignes vues dans les chemins Infrabel, triées par n° (ordre naturel). */
export function buildRailLines(
  paths: Iterable<{ points: PathPoint[] }>,
  opts: LineOptions = {},
): RailLine[] {
  const km = kmIndex(opts.sections);
  const out: RailLine[] = [];
  for (const [line, edges] of lineEdges(paths)) {
    const r = orderLine(line, edges, opts, km.get(line));
    if (r) out.push(r);
  }
  return out.sort((a, b) => a.line.localeCompare(b.line, "fr", { numeric: true }));
}

/** Recherche des gares du référentiel par nom FR, nom NL ou alias (replié) pour `LineOptions.station`. */
export function stationIndex(
  records: Iterable<{
    name: string;
    nameNl?: string;
    aliases?: string[];
    abbr: string;
    served: boolean;
  }>,
): (name: string) => StationInfo | undefined {
  const byFold = new Map<string, StationInfo>();
  for (const r of records)
    for (const n of [r.name, r.nameNl ?? "", ...(r.aliases ?? [])]) {
      const k = foldStation(n);
      if (k && !byFold.has(k)) byFold.set(k, { abbr: r.abbr, served: r.served });
    }
  return (name) => byFold.get(foldStation(name));
}

const DISTRICT_ORDER = ["DSO", "DSE", "DCE"];

/**
 * District d'une ligne = district MAJORITAIRE de ses gares (district de chaque gare lu dans Ressources › Gares, où il
 * se modifie) ; à égalité : DSO, DSE, DCE. Vide si aucune gare n'a de district (lignes hors des trois districts).
 */
export function lineDistrict(
  names: string[],
  districtOf: (name: string) => string,
): { district: string; counts: Record<string, number> } {
  const counts: Record<string, number> = {};
  for (const n of names) {
    const d = districtOf(n);
    if (d) counts[d] = (counts[d] ?? 0) + 1;
  }
  const district =
    Object.entries(counts).sort(
      (a, b) => b[1] - a[1] || DISTRICT_ORDER.indexOf(a[0]) - DISTRICT_ORDER.indexOf(b[0]),
    )[0]?.[0] ?? "";
  return { district, counts };
}
