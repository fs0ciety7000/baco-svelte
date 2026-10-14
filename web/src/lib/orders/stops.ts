// Lignes et arrêts intermédiaires d'un bon bus (déduits des gares de chaque ligne, ex-ligne_data).

/**
 * Ligne et ses gares (affichage, « toutes les gares des lignes cochées »). `segments` : tronçons continus (tronc, puis
 * chaque embranchement depuis sa gare de bifurcation) pour l'itinéraire ; sans eux, `stations` est un seul tronçon.
 */
export type LineInfo = { line: string; stations: string[]; segments?: string[][] };

/** Tronçons continus d'une ligne. */
export const segmentsOf = (l: LineInfo): string[][] =>
  l.segments?.length ? l.segments : [l.stations];

/** Identité d'une ligne : « L.96 » (référentiel BACO), « 96 » (référentiel des trains) et « l 96 » se rejoignent. */
export const lineId = (line: string) =>
  String(line ?? "")
    .trim()
    .replace(/^L\.?\s*/i, "")
    .toUpperCase();

/** Vrai si la liste contient la ligne (quelle que soit son écriture). */
export const sameLine = (lines: string[], line: string) =>
  lines.some((l) => lineId(l) === lineId(line));

// Comparaison tolérante (11 oct. 2026) : accents, casse, tirets et espaces ignorés (« bruxelles midi » = « Bruxelles-Midi »).
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

function indexOf(stations: string[], name: string): number {
  const n = norm(name);
  return n ? stations.findIndex((s) => norm(s) === n) : -1;
}

/** Lignes qui desservent l'origine et la destination ; à défaut, celles qui desservent l'une des deux. */
export function suggestLines(lines: LineInfo[], origin: string, destination: string): string[] {
  const both = lines.filter(
    (l) => indexOf(l.stations, origin) !== -1 && indexOf(l.stations, destination) !== -1,
  );
  if (both.length) return both.map((l) => l.line);
  return lines
    .filter((l) => indexOf(l.stations, origin) !== -1 || indexOf(l.stations, destination) !== -1)
    .map((l) => l.line);
}

/** Gares strictement entre l'origine et la destination, sur les lignes choisies, dans l'ordre du trajet. */
export function stopsBetween(
  lines: LineInfo[],
  selected: string[],
  origin: string,
  destination: string,
): string[] {
  const out: string[] = [];
  for (const l of lines) {
    if (!selected.includes(l.line)) continue;
    for (const seg of segmentsOf(l)) {
      const a = indexOf(seg, origin);
      const b = indexOf(seg, destination);
      if (a === -1 || b === -1 || a === b) continue;
      const slice = a < b ? seg.slice(a + 1, b) : seg.slice(b + 1, a).reverse();
      for (const s of slice) if (!out.some((x) => norm(x) === norm(s))) out.push(s);
      break;
    }
  }
  return out;
}

/** `transfers` : gares de correspondance (changement de ligne), les seuls arrêts d'un bus « direct ». */
export type Route = { lines: string[]; stops: string[]; transfers: string[] };

// Coût d'un changement de ligne (en arrêts) : à longueur proche, l'itinéraire avec le moins de changements gagne.
const TRANSFER_COST = 4;

/**
 * Itinéraire à travers le réseau (retour utilisateur du 11 oct. 2026 : Mons → Charleroi-Central n'est desservi par aucune
 * ligne unique, il faut enchaîner L.118 puis L.124). Plus court chemin sur le graphe des gares voisines de chaque ligne
 * (1 par arrêt, `TRANSFER_COST` par changement de ligne). `allowed` limite aux lignes cochées. Renvoie les lignes
 * empruntées, dans l'ordre, et les gares strictement entre l'origine et la destination ; null si aucun chemin.
 */
export function routeBetween(
  lines: LineInfo[],
  origin: string,
  destination: string,
  allowed?: string[],
): Route | null {
  const from = norm(origin);
  const to = norm(destination);
  if (!from || !to || from === to) return null;
  const pool = allowed?.length ? lines.filter((l) => allowed.includes(l.line)) : lines;
  const label = new Map<string, string>();
  const adj = new Map<string, { to: string; line: string }[]>();
  const link = (a: string, b: string, line: string) => {
    const list = adj.get(a) ?? [];
    list.push({ to: b, line });
    adj.set(a, list);
  };
  for (const l of pool) {
    for (const seg of segmentsOf(l)) {
      let prev = "";
      for (const s of seg) {
        const k = norm(s);
        if (!k) continue;
        if (!label.has(k)) label.set(k, s);
        if (prev && prev !== k) {
          link(prev, k, l.line);
          link(k, prev, l.line);
        }
        prev = k;
      }
    }
  }
  if (!adj.has(from) || !adj.has(to)) return null;

  // Dijkstra sur les états « gare | ligne d'arrivée » (petit graphe : quelques milliers d'états).
  type State = { station: string; line: string };
  const key = (s: State) => `${s.station}|${s.line}`;
  const dist = new Map<string, number>();
  const prevOf = new Map<string, State | null>();
  const queue: { cost: number; state: State }[] = [{ cost: 0, state: { station: from, line: "" } }];
  dist.set(key(queue[0]!.state), 0);
  prevOf.set(key(queue[0]!.state), null);
  let end: State | null = null;
  while (queue.length) {
    let best = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i]!.cost < queue[best]!.cost) best = i;
    const { cost, state } = queue.splice(best, 1)[0]!;
    if (cost > (dist.get(key(state)) ?? Infinity)) continue;
    if (state.station === to) {
      end = state;
      break;
    }
    for (const e of adj.get(state.station) ?? []) {
      const next: State = { station: e.to, line: e.line };
      const c = cost + 1 + (state.line && state.line !== e.line ? TRANSFER_COST : 0);
      if (c < (dist.get(key(next)) ?? Infinity)) {
        dist.set(key(next), c);
        prevOf.set(key(next), state);
        queue.push({ cost: c, state: next });
      }
    }
  }
  if (!end) return null;
  const path: State[] = [];
  for (let s: State | null = end; s; s = prevOf.get(key(s)) ?? null) path.unshift(s);
  const used: string[] = [];
  for (const s of path) if (s.line && used.at(-1) !== s.line) used.push(s.line);
  const stops = path.slice(1, -1).map((s) => label.get(s.station) ?? s.station);
  // Correspondance : la ligne d'arrivée à la gare diffère de celle qui en repart.
  const transfers: string[] = [];
  for (let i = 1; i < path.length - 1; i++)
    if (path[i]!.line !== path[i + 1]!.line)
      transfers.push(label.get(path[i]!.station) ?? path[i]!.station);
  return { lines: [...new Set(used)], stops, transfers };
}
