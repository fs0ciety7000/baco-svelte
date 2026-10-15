// Logique pure de l'écran du planificateur (vue Jour) : rangées, échelle de temps, blocs, compteurs, filtres de « À
// attribuer », dépôt d'un glisser-déposer, attributions optimistes. Testée (`board.test.ts`) ; aucun DOM ici.

import { brusselsToUtc } from "@/lib/orders/time";

import { checkAssign } from "./assign";
import { isCancelled, isPmr, stationKey } from "./window";
import { MINUTE, hhmm, isWeekendOrHoliday, toMs } from "./time";
import type {
  BcsCounter,
  CheckResult,
  PlannerAgent,
  PlannerAssignee,
  PlannerBase,
  PlannerContext,
  PlannerPost,
  PlannerTask,
} from "./types";

export const POST_ORDER: readonly PlannerPost[] = ["PA", "CPI", "OPI", "SPI", "EXTRA"];
const HOUR = 60 * MINUTE;

// ---------------------------------------------------------------------------------------------------------------
// Rangées

export type AgentGroup = {
  /** Code de la base (« FMS ») ou "" (base inconnue). */
  code: string;
  base: PlannerBase | null;
  agents: PlannerAgent[];
};

/** Agents regroupés par base (ordre des bases reçu), puis poste (PA, CPI, OPI, SPI, EXTRA), puis début de service. */
export function groupAgents(
  agents: readonly PlannerAgent[],
  bases: readonly PlannerBase[],
): AgentGroup[] {
  const order = new Map(bases.map((b, i) => [b.code, i]));
  const groups = new Map<string, AgentGroup>();
  for (const a of agents) {
    const code = order.has(a.base) ? a.base : "";
    let g = groups.get(code);
    if (!g)
      groups.set(
        code,
        (g = { code, base: bases.find((b) => b.code === code) ?? null, agents: [] }),
      );
    g.agents.push(a);
  }
  const firstStart = (a: PlannerAgent) =>
    Math.min(...a.shifts.map((s) => toMs(s.start)).filter((x) => !Number.isNaN(x)), Infinity);
  for (const g of groups.values())
    g.agents.sort(
      (x, y) =>
        POST_ORDER.indexOf(x.post) - POST_ORDER.indexOf(y.post) ||
        firstStart(x) - firstStart(y) ||
        x.name.localeCompare(y.name, "fr"),
    );
  return [...groups.values()].sort(
    (a, b) => (order.get(a.code) ?? 999) - (order.get(b.code) ?? 999),
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Échelle de temps

export type DayBounds = {
  /** Minuit (Bruxelles) du jour de service, en ms. */
  midnight: number;
  /** Début / fin de l'axe (ms) : 4 h → 24 h, étendu aux services de nuit (jusqu'à 8 h le lendemain au plus). */
  start: number;
  end: number;
};

export function dayBounds(
  day: string,
  agents: readonly PlannerAgent[],
  tasks: readonly PlannerTask[] = [],
): DayBounds {
  const midnight = toMs(brusselsToUtc(day, "00:00"));
  let start = midnight + 4 * HOUR;
  let end = midnight + 24 * HOUR;
  const times: number[] = [];
  for (const a of agents) for (const s of a.shifts) times.push(toMs(s.start), toMs(s.end));
  for (const t of tasks) times.push(toMs(t.start), toMs(t.end));
  for (const x of times) {
    if (Number.isNaN(x)) continue;
    // Nuit de la veille qui déborde sur le jour : l'axe commence au plus tôt à minuit.
    if (x < start) start = Math.max(midnight, midnight + Math.floor((x - midnight) / HOUR) * HOUR);
    if (x > end)
      end = Math.min(midnight + 32 * HOUR, midnight + Math.ceil((x - midnight) / HOUR) * HOUR);
  }
  return { midnight, start, end };
}

/** Heures pleines de l'axe : instant et libellé « 09h ». */
export function hourTicks(b: DayBounds): { at: number; label: string }[] {
  const out: { at: number; label: string }[] = [];
  for (let t = b.start; t <= b.end; t += HOUR)
    out.push({ at: t, label: `${hhmm(t).slice(0, 2)}h` });
  return out;
}

/** Pixels par heure des trois échelles. */
export const SCALES = { large: 72, normal: 150, detail: 280 } as const;
export type ScaleId = keyof typeof SCALES;

export const xOf = (ms: number, b: DayBounds, pxPerHour: number) =>
  ((ms - b.start) / HOUR) * pxPerHour;

// ---------------------------------------------------------------------------------------------------------------
// Blocs d'une rangée

export type Block = {
  key: string;
  tasks: PlannerTask[];
  start: number;
  end: number;
  lane: number;
};

/** Clé de regroupement : plusieurs PMR d'un même train, même gare, même heure = un seul bloc (« 2 PMR · 1925 »). */
function blockKey(t: PlannerTask): string {
  if (t.linkKey?.startsWith("tr:")) return t.linkKey;
  if (isPmr(t) && t.train && t.trainAt)
    return `tr:${t.train.replace(/\s+/g, "").toUpperCase()}:${stationKey(t.station)}:${toMs(t.trainAt)}`;
  return `id:${t.id}`;
}

/** Blocs d'une rangée (tâches regroupées par arrêt de train) placés sur des pistes sans chevauchement. */
export function rowBlocks(tasks: readonly PlannerTask[]): { blocks: Block[]; lanes: number } {
  const map = new Map<string, Block>();
  for (const t of tasks) {
    const s = toMs(t.start);
    const e = Math.max(s, toMs(t.end));
    if (Number.isNaN(s)) continue;
    const k = blockKey(t);
    const b = map.get(k);
    if (b) {
      b.tasks.push(t);
      b.start = Math.min(b.start, s);
      b.end = Math.max(b.end, e);
    } else map.set(k, { key: k, tasks: [t], start: s, end: e, lane: 0 });
  }
  const blocks = [...map.values()].sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds: number[] = [];
  for (const b of blocks) {
    let lane = laneEnds.findIndex((end) => end <= b.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = b.end;
    b.lane = lane;
  }
  return { blocks, lanes: Math.max(1, laneEnds.length) };
}

/** Nombre de voyageurs d'un bloc et libellé court (« 1CRF », « 2 PMR », « EDF »). */
export function blockLabel(tasks: readonly PlannerTask[]): string {
  const first = tasks[0];
  if (!first) return "";
  if (!isPmr(first)) return first.label || (first.kind === "technique" ? "Technique" : "Tâche");
  const pax = tasks.reduce((a, t) => a + Math.max(1, t.pax || 1), 0);
  if (tasks.length > 1) return `${pax} PMR`;
  return `${pax}${first.pmrType && first.pmrType !== "AUTRE" ? first.pmrType : "PMR"}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Compteurs, conflits, groupes liés

export const isAssigned = (t: PlannerTask) => !!t.assignee;
export const isTodo = (t: PlannerTask) =>
  !t.assignee && !isCancelled(t) && t.kind !== "trajet" && t.status !== "faite";

/** Contrôle des tâches déjà attribuées (agent ou guichet) : celles en refus sont des conflits. */
export function conflictsOf(ctx: PlannerContext): Map<string, CheckResult> {
  const out = new Map<string, CheckResult>();
  for (const t of ctx.tasks) {
    if (!t.assignee || isCancelled(t) || (t.assignee.kind !== "agent" && t.assignee.kind !== "bcs"))
      continue;
    const r = checkAssign(t, t.assignee, ctx);
    if (r.level !== "ok") out.set(t.id, r);
  }
  return out;
}

export type BoardCounters = { toAssign: number; conflicts: number; coverage: number; pmr: number };

export function boardCounters(
  ctx: PlannerContext,
  conflicts: Map<string, CheckResult>,
): BoardCounters {
  const pmr = ctx.tasks.filter((t) => isPmr(t) && !isCancelled(t));
  const covered = pmr.filter(isAssigned).length;
  let n = 0;
  for (const r of conflicts.values()) if (r.level === "block") n++;
  return {
    toAssign: ctx.tasks.filter(isTodo).length,
    conflicts: n,
    coverage: pmr.length ? Math.round((covered / pmr.length) * 100) : 100,
    pmr: pmr.length,
  };
}

/** Tâches à attribuer ensemble (même `linkKey` : correspondance ou même train), annulées exclues ; au moins `id`. */
export function linkedIds(id: string, tasks: readonly PlannerTask[]): string[] {
  const t = tasks.find((x) => x.id === id);
  if (!t?.linkKey) return [id];
  const ids = tasks.filter((x) => x.linkKey === t.linkKey && !isCancelled(x)).map((x) => x.id);
  return ids.includes(id) ? ids : [id, ...ids];
}

// ---------------------------------------------------------------------------------------------------------------
// Glisser-déposer

export type DropTarget =
  | { kind: "agent"; agentId: string }
  | { kind: "bcs"; station: string }
  | { kind: "taxi" }
  | { kind: "cdb" };

export function assigneeOf(target: DropTarget, label?: string): PlannerAssignee {
  if (target.kind === "agent")
    return { kind: "agent", agentId: target.agentId, ...(label ? { label } : {}) };
  if (target.kind === "bcs") return { kind: "bcs", label: target.station };
  return { kind: target.kind, ...(label ? { label } : {}) };
}

/** Verdict le plus sévère pour l'ensemble des tâches glissées (raisons fusionnées, sans doublon). */
export function dropVerdict(
  ids: readonly string[],
  target: DropTarget,
  ctx: PlannerContext,
): CheckResult {
  const rank = { ok: 0, warn: 1, block: 2 } as const;
  let level: CheckResult["level"] = "ok";
  const reasons: string[] = [];
  const who = assigneeOf(target);
  for (const id of ids) {
    const t = ctx.tasks.find((x) => x.id === id);
    if (!t) continue;
    // Déposer une tâche sur sa propre destination : rien à faire.
    if (sameAssignee(t.assignee, who)) continue;
    const r = checkAssign(t, who, ctx);
    if (rank[r.level] > rank[level]) level = r.level;
    for (const x of r.reasons) if (!reasons.includes(x)) reasons.push(x);
  }
  return { level, reasons };
}

export function sameAssignee(
  a: PlannerAssignee | undefined,
  b: PlannerAssignee | undefined,
): boolean {
  if (!a || !b) return !a && !b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "agent") return a.agentId === b.agentId;
  if (a.kind === "bcs") return stationKey(a.label) === stationKey(b.label);
  return true;
}

/** Refus parce que l'agent est occupé (un autre agent libre est alors proposé au lieu d'un simple refus). */
export const isBusyRefusal = (r: CheckResult) =>
  r.level === "block" &&
  r.reasons.some((x) => x.startsWith("Occupé")) &&
  !r.reasons.some(
    (x) =>
      x.startsWith("Hors zone") || x.startsWith("Hors service") || x === "Pas de service ce jour",
  );

// ---------------------------------------------------------------------------------------------------------------
// Attributions optimistes

export type Override = { assignee: PlannerAssignee | null; updated?: string };

/**
 * Applique les attributions en cours (ou faites mais pas encore relues) : nouveaux objets pour les tâches touchées,
 * mêmes objets pour les autres (les caches du moteur restent valables). Une attribution est oubliée dès que le serveur
 * renvoie le `updated` attendu.
 */
export function applyOverrides(
  tasks: readonly PlannerTask[],
  overrides: ReadonlyMap<string, Override>,
): PlannerTask[] {
  if (!overrides.size) return tasks as PlannerTask[];
  return tasks.map((t) => {
    const o = overrides.get(t.id);
    if (!o) return t;
    const copy: PlannerTask = { ...t };
    if (o.assignee) {
      copy.assignee = o.assignee;
      if (copy.status === "a_attribuer") copy.status = "attribuee";
    } else {
      delete copy.assignee;
      if (copy.status === "attribuee") copy.status = "a_attribuer";
    }
    return copy;
  });
}

/** Attributions dont le serveur a rattrapé l'état (même `updated`) : à oublier. */
export function settledOverrides(
  overrides: ReadonlyMap<string, Override>,
  updatedOf: (id: string) => string | undefined,
): string[] {
  const out: string[] = [];
  for (const [id, o] of overrides) {
    if (!o.updated) continue;
    const cur = updatedOf(id);
    if (
      cur !== undefined &&
      Date.parse(cur.replace(" ", "T")) >= Date.parse(o.updated.replace(" ", "T"))
    )
      out.push(id);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// « À attribuer » : zones, filtres, recherche

/** Zone (code de base) d'une gare : la gare de base, sinon la première base dont la matrice la dessert. */
export function stationZones(bases: readonly PlannerBase[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of bases) out.set(stationKey(b.name), b.code);
  for (const b of bases)
    for (const t of b.travel) {
      const k = stationKey(t.station);
      if (!out.has(k)) out.set(k, b.code);
    }
  return out;
}

export type TodoFilter = {
  source: "toutes" | "acceptees" | "attente";
  zone: string;
  station: string;
};
export const NO_FILTER: TodoFilter = { source: "toutes", zone: "", station: "" };

export const isPending = (t: PlannerTask) => t.source === "dicos_attente";

export function filterTodo(
  tasks: readonly PlannerTask[],
  f: TodoFilter,
  zones: ReadonlyMap<string, string>,
): PlannerTask[] {
  return tasks
    .filter(isTodo)
    .filter((t) =>
      f.source === "attente" ? isPending(t) : f.source === "acceptees" ? !isPending(t) : true,
    )
    .filter((t) => !f.zone || zones.get(stationKey(t.station)) === f.zone)
    .filter((t) => !f.station || stationKey(t.station) === stationKey(f.station))
    .sort((a, b) => refMs(a) - refMs(b) || a.station.localeCompare(b.station, "fr"));
}

/** Heure de référence d'une tâche : heure du train, sinon début. */
export const refMs = (t: PlannerTask) => (t.trainAt ? toMs(t.trainAt) : toMs(t.start));

const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Recherche d'agent ou de n° de train : chaque mot doit figurer dans le nom de l'agent ou dans un train de sa journée. */
export function agentMatches(
  agent: PlannerAgent,
  tasks: readonly PlannerTask[],
  q: string,
): boolean {
  const words = fold(q).split(" ").filter(Boolean);
  if (!words.length) return true;
  const hay = fold(
    [
      agent.name,
      agent.post,
      agent.base,
      ...tasks.filter((t) => t.assignee?.agentId === agent.id).map((t) => t.train ?? ""),
    ].join(" "),
  );
  return words.every((w) => hay.includes(w));
}

export function taskMatches(t: PlannerTask, q: string): boolean {
  const words = fold(q).split(" ").filter(Boolean);
  if (!words.length) return true;
  const hay = fold(
    [t.train ?? "", t.station, t.otherStation ?? "", t.dossier ?? "", t.label ?? ""].join(" "),
  );
  return words.every((w) => hay.includes(w));
}

// ---------------------------------------------------------------------------------------------------------------
// Guichets B-CS

/** Horaire du guichet pour le jour : semaine, ou week-end / férié (« R67 »). */
export function bcsHours(c: BcsCounter, day: string): string | undefined {
  const noon = toMs(brusselsToUtc(day, "12:00"));
  return isWeekendOrHoliday(noon) ? c.weekendHours : c.weekdayHours;
}

/** Intervalle d'ouverture (ms) du guichet le jour donné, ou null (fermé). */
export function bcsOpen(
  c: BcsCounter,
  day: string,
): { start: number; end: number; label: string } | null {
  const raw = bcsHours(c, day);
  const m = /^\s*(\d{1,2})[:h](\d{2})\s*-\s*(\d{1,2})[:h](\d{2})\s*$/.exec(raw ?? "");
  if (!m) return null;
  const pad = (h: string, mi: string) => `${h.padStart(2, "0")}:${mi}`;
  const start = toMs(brusselsToUtc(day, pad(m[1]!, m[2]!)));
  const end = toMs(brusselsToUtc(day, pad(m[3]!, m[4]!)));
  return { start, end, label: `${hhmm(start)}–${hhmm(end)}` };
}

// ---------------------------------------------------------------------------------------------------------------
// Libellés

export const KIND_LABEL: Record<PlannerTask["kind"], string> = {
  pmr_in: "IN · embarquement",
  pmr_out: "OUT · débarquement",
  technique: "Technique",
  trajet: "Trajet",
  autre: "Autre",
};

export const PMR_TYPE_LABEL: Record<string, string> = {
  NV: "Non voyant",
  MR: "Mobilité réduite",
  DCO: "Difficultés de compréhension",
  CRF: "Chaise roulante fixe",
  CRE: "Chaise roulante électrique",
  CRP: "Chaise roulante pliable",
};

/** Nom accessible complet d'une tâche (« 1MR OUT train 3418 à Saint-Ghislain, 09h45-10h00, en attente DICOS »). */
export function taskName(t: PlannerTask): string {
  const dir = t.kind === "pmr_in" ? "IN" : t.kind === "pmr_out" ? "OUT" : "";
  const parts = [
    isPmr(t)
      ? `${Math.max(1, t.pax || 1)}${t.pmrType && t.pmrType !== "AUTRE" ? t.pmrType : " PMR"} ${dir}`
      : t.label || KIND_LABEL[t.kind],
    t.train ? `train ${t.train}` : "",
    t.station ? `à ${t.station}` : "",
    `${hhmm(toMs(t.start))}-${hhmm(toMs(t.end))}`,
    isPending(t) ? "en attente DICOS" : "",
    isCancelled(t) ? "annulée" : "",
  ];
  return parts.filter(Boolean).join(", ");
}
