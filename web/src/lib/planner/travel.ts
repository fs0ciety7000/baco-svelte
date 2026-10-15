// Trajets en voiture et couverture des gares (REGLES §3-4, réponses de l'utilisateur du 15 oct. 2026).
//
// Le réseau est la matrice des bases (aller simple base → gare, valable dans les deux sens). Une base atteint sa gare,
// les gares de sa matrice, et celles des bases qu'elle couvre (`covers`, en passant par la base couverte). Rien d'autre :
// les règles « jamais Mons → Charleroi, jamais Charleroi → zone FMS » découlent des données.

import { stationKey } from "./window";
import type { PlannerAgent, PlannerBase } from "./types";

type Net = {
  byCode: Map<string, PlannerBase>;
  /** Base dont la gare porte cette clé. */
  byStation: Map<string, PlannerBase>;
  /** Arêtes symétriques clé → clé → minutes (la plus courte si deux matrices diffèrent). */
  edges: Map<string, Map<string, number>>;
  covered: Map<string, { base: PlannerBase; key: string; minutes: number }[]>;
  reach: Map<string, { minutes: number; via: PlannerBase | null } | null>;
};

const nets = new WeakMap<PlannerBase[], Net>();

function addEdge(edges: Net["edges"], a: string, b: string, m: number) {
  if (!a || !b || a === b || !Number.isFinite(m) || m < 0) return;
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    let row = edges.get(x);
    if (!row) edges.set(x, (row = new Map()));
    const old = row.get(y);
    if (old === undefined || m < old) row.set(y, m);
  }
}

function net(bases: PlannerBase[]): Net {
  let n = nets.get(bases);
  if (n) return n;
  n = {
    byCode: new Map(),
    byStation: new Map(),
    edges: new Map(),
    covered: new Map(),
    reach: new Map(),
  };
  for (const b of bases) {
    n.byCode.set(b.code.toUpperCase(), b);
    n.byStation.set(stationKey(b.name), b);
  }
  for (const b of bases) {
    const from = stationKey(b.name);
    for (const t of b.travel) addEdge(n.edges, from, resolve(n, t.station), t.minutes);
  }
  nets.set(bases, n);
  return n;
}

/** Clé d'une gare ; un code de base (« FTY ») vaut sa gare. */
function resolve(n: Net, station: string): string {
  const code = n.byCode.get(station.trim().toUpperCase());
  return code ? stationKey(code.name) : stationKey(station);
}

const edge = (n: Net, a: string, b: string) => (a === b ? 0 : n.edges.get(a)?.get(b));

function baseOf(n: Net, base: PlannerBase | string): PlannerBase | undefined {
  return typeof base === "string" ? n.byCode.get(base.trim().toUpperCase()) : base;
}

/** Bases couvertes atteignables depuis `b` (code connu et trajet b → base couverte dans la matrice). */
function covered(n: Net, b: PlannerBase): { base: PlannerBase; key: string; minutes: number }[] {
  const hit = n.covered.get(b.code);
  if (hit && n.byCode.get(b.code.toUpperCase()) === b) return hit;
  const home = stationKey(b.name);
  const out: { base: PlannerBase; key: string; minutes: number }[] = [];
  for (const code of b.covers) {
    const c = n.byCode.get(code.trim().toUpperCase());
    if (!c || c.code === b.code) continue;
    const key = stationKey(c.name);
    const m = edge(n, home, key);
    if (m !== undefined) out.push({ base: c, key, minutes: m });
  }
  if (n.byCode.get(b.code.toUpperCase()) === b) n.covered.set(b.code, out);
  return out;
}

/** Temps base → gare (direct, sinon par une base couverte) et base couverte empruntée. */
function reach(
  n: Net,
  b: PlannerBase,
  key: string,
): { minutes: number; via: PlannerBase | null } | null {
  const own = n.byCode.get(b.code.toUpperCase()) === b;
  const ck = `${b.code}|${key}`;
  if (own && n.reach.has(ck)) return n.reach.get(ck)!;
  const r = computeReach(n, b, key);
  if (own) n.reach.set(ck, r);
  return r;
}

function computeReach(
  n: Net,
  b: PlannerBase,
  key: string,
): { minutes: number; via: PlannerBase | null } | null {
  const home = stationKey(b.name);
  const direct = edge(n, home, key);
  let best: { minutes: number; via: PlannerBase | null } | null =
    direct !== undefined ? { minutes: direct, via: null } : null;
  for (const c of covered(n, b)) {
    const m = edge(n, c.key, key);
    if (m === undefined) continue;
    const total = c.minutes + m;
    if (!best || total < best.minutes)
      best = { minutes: total, via: c.key === key ? null : c.base };
  }
  return best;
}

export type Coverage = {
  ok: boolean;
  viaBase: string | null;
  minutes: number | null;
  reason: string;
};

/**
 * L'agent peut-il prendre en charge à cette gare ? Oui si sa base la dessert (gare de base, matrice) ou si une base
 * qu'elle couvre la dessert (`viaBase` = code de cette base).
 */
export function coverage(
  agent: Pick<PlannerAgent, "base">,
  station: string,
  bases: PlannerBase[],
): Coverage {
  const n = net(bases);
  const b = baseOf(n, agent.base);
  if (!b) return { ok: false, viaBase: null, minutes: null, reason: `Base ${agent.base} inconnue` };
  const key = resolve(n, station);
  const r = reach(n, b, key);
  if (!r)
    return {
      ok: false,
      viaBase: null,
      minutes: null,
      reason: `Hors zone : ${b.name} ne couvre pas ${station}`,
    };
  if (r.minutes === 0) return { ok: true, viaBase: null, minutes: 0, reason: "Gare de base" };
  if (r.via)
    return { ok: true, viaBase: r.via.code, minutes: r.minutes, reason: `Par ${r.via.name}` };
  return { ok: true, viaBase: null, minutes: r.minutes, reason: `Desservie depuis ${b.name}` };
}

/**
 * Minutes de voiture de `fromStation` à `toStation` pour un agent de la base `base` : 0 si même gare ; trajet direct
 * s'il figure dans une matrice (base ↔ gare) ; sinon passage par la base de l'agent (somme) ou par une base couverte
 * qui dessert les deux gares. `null` si l'une des gares est hors de sa couverture.
 */
export function travelMinutes(
  base: PlannerBase | string,
  fromStation: string,
  toStation: string,
  bases: PlannerBase[],
): number | null {
  const n = net(bases);
  const b = baseOf(n, base);
  if (!b) return null;
  const a = resolve(n, fromStation);
  const z = resolve(n, toStation);
  const ra = reach(n, b, a);
  const rz = reach(n, b, z);
  if (!ra || !rz) return null;
  if (a === z) return 0;
  let best = ra.minutes + rz.minutes;
  const direct = edge(n, a, z);
  if (direct !== undefined && direct < best) best = direct;
  for (const c of covered(n, b)) {
    const x = edge(n, c.key, a);
    const y = edge(n, c.key, z);
    if (x !== undefined && y !== undefined && x + y < best) best = x + y;
  }
  return best;
}

/** Base d'un agent (par code), ou undefined. */
export function baseByCode(bases: PlannerBase[], code: string): PlannerBase | undefined {
  return net(bases).byCode.get(code.trim().toUpperCase());
}

/** Vrai si la gare est la gare de la base. */
export function isBaseStation(base: PlannerBase, station: string): boolean {
  const n = new Map([[base.code.toUpperCase(), base]]);
  const code = n.get(station.trim().toUpperCase());
  return stationKey(code ? code.name : station) === stationKey(base.name);
}
