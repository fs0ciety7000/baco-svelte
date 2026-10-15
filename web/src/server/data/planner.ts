import "server-only";

import type { RecordModel } from "pocketbase";

import { addDays, brusselsToUtc, pbDate } from "@/lib/orders/time";
import { stationKey } from "@/lib/pmr/model";
import { agentName, type QuinyxKind, type StationPost } from "@/lib/quinyx/model";

import { pbForRequest } from "./orders";

// Planificateur de tâches PMR (lot P0, 15 oct. 2026, docs/design/CADRAGE-PLANIFICATEUR-PMR.md) : lecture d'une journée
// avec le jeton de l'agent (règles `planner:read` / `quinyx:read` de PocketBase). Aucun nom de voyageur : les tâches
// portent le n° de dossier, la fiche nominative reste derrière `pmr:read` (Missions PMR).
//
// Heures : instants ISO (UTC). `start` / `end` d'une tâche DICOS = heure du TRAIN ; la fenêtre réelle de la prise en
// charge se calcule à l'affichage (`lib/planner/`).

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const iso = (v: unknown) => pbDate(str(v))?.toISOString() ?? "";
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export type PlannerBase = {
  id: string;
  code: string;
  name: string;
  district: string;
  zone: string;
  posts: string[];
  /** Trajets en voiture depuis la base (minutes, aller simple). */
  travel: { station: string; minutes: number }[];
  /** Codes des bases que celle-ci peut couvrir. */
  covers: string[];
};

export type PlannerShift = {
  id: string;
  /** Jour de service (une nuit commencée la veille garde le jour de la veille). */
  day: string;
  start: string;
  end: string;
  code: string;
  section: string;
  kind: QuinyxKind;
  post: StationPost | "";
  base: string;
  district: string;
};

export type PlannerAgent = {
  /** Fiche `quinyx_agents` (destination d'une attribution « agent »). */
  id: string;
  name: string;
  /** Poste et base de la première prestation du jour. */
  post: StationPost | "";
  base: string;
  district: string;
  shifts: PlannerShift[];
};

export type PlannerTaskKind = "pmr_in" | "pmr_out" | "technique" | "trajet" | "autre";
export type PlannerTaskStatus = "a_attribuer" | "attribuee" | "faite" | "annulee";
export type PlannerAssigneeKind = "agent" | "bcs" | "taxi" | "cdb" | "";

export type PlannerTask = {
  id: string;
  day: string;
  kind: PlannerTaskKind;
  start: string;
  end: string;
  station: string;
  stationKey: string;
  otherStation: string;
  train: string;
  pmrType: string;
  pax: number;
  light: boolean;
  dossier: string;
  source: "dicos_pending" | "dicos_mission" | "manuel" | "modele";
  sourceKey: string;
  dicosStatus: "proposal" | "accepted" | "cancelled" | "";
  stationOk: "ok" | "pending" | "";
  /** Mission DICOS acceptée reliée (`pmr_assists`), vide pour un dossier en attente. */
  assist: string;
  assigneeKind: PlannerAssigneeKind;
  assigneeAgent: string;
  assigneeLabel: string;
  status: PlannerTaskStatus;
  linkKey: string;
  origin: "manuel" | "auto" | "";
  label: string;
  note: string;
  /** District déduit de la gare (bases du planificateur : gare de base ou gare de sa matrice), "" si inconnu. */
  district: string;
  /** Verrou optimiste : à renvoyer aux actions. */
  updated: string;
};

export type BcsCounter = {
  id: string;
  station: string;
  weekdayHours: string;
  weekendHours: string;
  kind: string;
  perHour: number;
  lightOnly: boolean;
  base: string;
};

export type PlannerTemplate = {
  id: string;
  weekday: number;
  base: string;
  post: string;
  label: string;
  kind: "technique" | "autre";
  start: string;
  end: string;
  train: string;
};

export type PlannerDay = {
  day: string;
  bases: PlannerBase[];
  agents: PlannerAgent[];
  tasks: PlannerTask[];
  bcs: BcsCounter[];
  templates: PlannerTemplate[];
};

function asBase(r: RecordModel): PlannerBase {
  return {
    id: r.id,
    code: str(r.code),
    name: str(r.name),
    district: str(r.district),
    zone: str(r.zone),
    posts: list<string>(r.posts).filter((p) => typeof p === "string"),
    travel: list<{ station?: unknown; minutes?: unknown }>(r.travel)
      .map((t) => ({ station: str(t?.station), minutes: num(t?.minutes) }))
      .filter((t) => t.station && t.minutes > 0),
    covers: list<string>(r.covers).filter((c) => typeof c === "string"),
  };
}

function asShift(r: RecordModel): PlannerShift {
  return {
    id: r.id,
    day: str(r.day),
    start: iso(r.start),
    end: iso(r.end),
    code: str(r.code),
    section: str(r.section),
    kind: (str(r.kind) || "autre") as QuinyxKind,
    post: str(r.post) as StationPost | "",
    base: str(r.base),
    district: str(r.district),
  };
}

export function asPlannerTask(r: RecordModel, district = ""): PlannerTask {
  return {
    id: r.id,
    day: str(r.day),
    kind: str(r.kind) as PlannerTaskKind,
    start: iso(r.start),
    end: iso(r.end) || iso(r.start),
    station: str(r.station),
    stationKey: str(r.station_key) || stationKey(str(r.station)),
    otherStation: str(r.other_station),
    train: str(r.train),
    pmrType: str(r.pmr_type),
    pax: num(r.pax),
    light: !!r.light,
    dossier: str(r.dossier),
    source: str(r.source) as PlannerTask["source"],
    sourceKey: str(r.source_key),
    dicosStatus: str(r.dicos_status) as PlannerTask["dicosStatus"],
    stationOk: str(r.station_ok) as PlannerTask["stationOk"],
    assist: str(r.assist),
    assigneeKind: str(r.assignee_kind) as PlannerAssigneeKind,
    assigneeAgent: str(r.assignee_agent),
    assigneeLabel: str(r.assignee_label),
    status: (str(r.status) || "a_attribuer") as PlannerTaskStatus,
    linkKey: str(r.link_key),
    origin: str(r.origin) as PlannerTask["origin"],
    label: str(r.label),
    note: str(r.note),
    district,
    updated: str(r.updated),
  };
}

/** District d'une gare d'après les bases : gare de base, sinon une gare de sa matrice de trajets. */
export function stationDistricts(bases: readonly PlannerBase[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of bases) out.set(stationKey(b.name), b.district);
  for (const b of bases)
    for (const t of b.travel) {
      const k = stationKey(t.station);
      if (!out.has(k)) out.set(k, b.district);
    }
  return out;
}

/** Jour ISO de la semaine (1 = lundi … 7 = dimanche) d'un jour « AAAA-MM-JJ ». */
export function isoWeekday(day: string): number {
  const d = new Date(`${day}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/**
 * Journée du planificateur : bases (des districts demandés ; toutes si vide), agents de gare en service ce jour
 * (prestations Quinyx des groupes « gares », nuit de la veille comprise tant qu'elle déborde sur le jour), tâches du jour,
 * guichets B-CS des bases retenues, modèles du jour de la semaine.
 */
export async function plannerDay(
  day: string,
  districts: readonly string[] = [],
): Promise<PlannerDay> {
  const pb = await pbForRequest();
  const want = new Set(districts.filter(Boolean));
  const inDistrict = (d: string) => !want.size || want.has(d);
  const dayStart = brusselsToUtc(day, "00:00");
  const [baseRows, shiftRows, taskRows, bcsRows, tplRows] = await Promise.all([
    pb.collection("planner_bases").getFullList({ filter: "active = true", sort: "district,name" }),
    pb.collection("quinyx_shifts").getFullList({
      filter: pb.filter('post != "" && (day = {:d} || (day = {:y} && end > {:s}))', {
        d: day,
        y: addDays(day, -1),
        s: dayStart.replace("T", " "),
      }),
      sort: "start",
      expand: "agent",
      fields:
        "id,day,start,end,code,section,kind,post,base,district,agent,expand.agent.id,expand.agent.first_name,expand.agent.last_name",
      batch: 500,
    }),
    pb.collection("planner_tasks").getFullList({
      filter: pb.filter("day = {:d}", { d: day }),
      sort: "start,station",
      batch: 500,
    }),
    pb.collection("bcs_counters").getFullList({ sort: "station" }),
    pb.collection("planner_templates").getFullList({
      filter: pb.filter("active = true && weekday = {:w}", { w: isoWeekday(day) }),
      sort: "base,start",
    }),
  ]);
  const allBases = baseRows.map(asBase);
  const bases = allBases.filter((b) => inDistrict(b.district));
  const baseCodes = new Set(bases.map((b) => b.code));
  const baseNames = new Set(bases.map((b) => stationKey(b.name)));

  const agents = new Map<string, PlannerAgent>();
  for (const r of shiftRows) {
    const s = asShift(r);
    // District de la prestation (base), sinon celui de la base de même nom.
    const district =
      s.district || allBases.find((b) => stationKey(b.name) === stationKey(s.base))?.district || "";
    if (want.size && !want.has(district) && !baseNames.has(stationKey(s.base))) continue;
    const a = (r.expand?.agent ?? {}) as RecordModel;
    const id = str(a.id) || str(r.agent);
    if (!id) continue;
    const cur = agents.get(id) ?? {
      id,
      name: agentName(a),
      post: s.post,
      base: s.base,
      district,
      shifts: [],
    };
    cur.shifts.push({ ...s, district });
    agents.set(id, cur);
  }

  const districtOf = stationDistricts(allBases);
  const tasks = taskRows
    .map((r) =>
      asPlannerTask(r, districtOf.get(str(r.station_key) || stationKey(str(r.station))) ?? ""),
    )
    .filter((t) => !want.size || !t.district || want.has(t.district));

  return {
    day,
    bases,
    agents: [...agents.values()].sort(
      (x, y) =>
        x.base.localeCompare(y.base, "fr") ||
        x.post.localeCompare(y.post) ||
        x.name.localeCompare(y.name, "fr"),
    ),
    tasks,
    bcs: bcsRows
      .map((r) => ({
        id: r.id,
        station: str(r.station),
        weekdayHours: str(r.weekday_hours),
        weekendHours: str(r.weekend_hours),
        kind: str(r.kind),
        perHour: num(r.per_hour),
        lightOnly: !!r.light_only,
        base: str(r.base),
      }))
      .filter((c) => !want.size || baseCodes.has(c.base)),
    templates: tplRows
      .map((r) => ({
        id: r.id,
        weekday: num(r.weekday),
        base: str(r.base),
        post: str(r.post),
        label: str(r.label),
        kind: (str(r.kind) || "technique") as PlannerTemplate["kind"],
        start: str(r.start),
        end: str(r.end),
        train: str(r.train),
      }))
      .filter((t) => !want.size || baseCodes.has(t.base)),
  };
}
