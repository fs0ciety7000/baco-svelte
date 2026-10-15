// Données de test FICTIVES (gares et temps de trajet des classeurs, REGLES §3.1 ; aucun nom réel).

import { brusselsToUtc } from "@/lib/orders/time";
import { taskWindow } from "./window";
import type { BcsCounter, PlannerAgent, PlannerBase, PlannerTask } from "./types";

export const DAY = "2026-10-15"; // jeudi
export const SATURDAY = "2026-10-17";

export const at = (time: string, day = DAY) => brusselsToUtc(day, time);

const tr = (pairs: [string, number][]) => pairs.map(([station, minutes]) => ({ station, minutes }));

export const BASES: PlannerBase[] = [
  {
    code: "FMS",
    name: "Mons",
    district: "DSO",
    zone: "FMS",
    covers: ["FTY"],
    travel: tr([
      ["Saint-Ghislain", 25],
      ["Jurbise", 30],
      ["Soignies", 35],
      ["Cambron-Casteau", 40],
      ["La Louvière-Sud", 40],
      ["Braine-le-Comte", 45],
      ["Leuze", 45],
      ["Ath", 50],
      ["Tournai", 50],
      ["Lessines", 60],
      ["Tubize", 60],
      ["Enghien", 60],
    ]),
  },
  {
    code: "FBC",
    name: "Braine-le-Comte",
    district: "DSO",
    covers: [],
    travel: tr([
      ["Soignies", 20],
      ["Tubize", 30],
      ["Enghien", 35],
      ["La Louvière-Sud", 40],
    ]),
  },
  {
    code: "FTY",
    name: "Tournai",
    district: "DSO",
    zone: "FTY",
    covers: ["FMS"],
    travel: tr([
      ["Leuze", 35],
      ["Mouscron", 35],
      ["Ath", 40],
      ["Lessines", 40],
      ["Cambron-Casteau", 50],
      ["Enghien", 50],
      ["Jurbise", 60],
      ["Soignies", 60],
    ]),
  },
  {
    code: "FCR",
    name: "Charleroi-Central",
    district: "DSO",
    zone: "FCR",
    covers: [],
    travel: tr([
      ["Marchienne-au-Pont", 20],
      ["Châtelet", 25],
      ["Tamines", 30],
      ["Luttre", 30],
      ["Fleurus", 30],
      ["Lobbes", 35],
      ["Walcourt", 40],
      ["Nivelles", 40],
      ["Braine-l'Alleud", 45],
      ["Mariembourg", 50],
      ["Waterloo", 60],
    ]),
  },
];

export const BCS: BcsCounter[] = [
  {
    station: "Nivelles",
    weekdayHours: "07:15-14:35",
    weekendHours: "08:15-15:35",
    perHour: 3,
    lightOnly: true,
    base: "FCR",
  },
  { station: "Tamines", weekdayHours: "07:15-14:35", perHour: 3, lightOnly: true, base: "FCR" },
];

function nextDay(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function agent(
  id: string,
  post: PlannerAgent["post"],
  base: string,
  shifts: [string, string][] = [["06:00", "14:00"]],
  day = DAY,
): PlannerAgent {
  return {
    id,
    name: `Agent ${id}`,
    post,
    base,
    shifts: shifts.map(([s, e]) => ({
      start: at(s, day),
      end: e <= s ? at(e, nextDay(day)) : at(e, day),
    })),
  };
}

type PmrOpts = Partial<PlannerTask> & { time: string; dir?: "IN" | "OUT"; type?: string };

/** Prise en charge fictive avec sa fenêtre standard. */
export function pmr(id: string, o: PmrOpts): PlannerTask {
  const day = o.day ?? DAY;
  const trainAt = at(o.time, day);
  const base: PlannerTask = {
    id,
    day,
    kind: o.dir === "OUT" ? "pmr_out" : "pmr_in",
    trainAt,
    start: trainAt,
    end: trainAt,
    station: o.station ?? "Mons",
    train: o.train ?? "906",
    pmrType: o.type ?? "NV",
    pax: o.pax ?? 1,
    light: o.light ?? true,
    source: "dicos",
    status: o.status ?? "a_attribuer",
    ...(o.dossier ? { dossier: o.dossier } : {}),
    ...(o.assignee ? { assignee: o.assignee } : {}),
    ...(o.linkKey ? { linkKey: o.linkKey } : {}),
    ...(o.dicosStatus ? { dicosStatus: o.dicosStatus } : {}),
  };
  return { ...base, ...taskWindow(base) };
}

/** Tâche technique fictive. */
export function tech(
  id: string,
  start: string,
  end: string,
  station: string,
  extra: Partial<PlannerTask> = {},
): PlannerTask {
  return {
    id,
    day: DAY,
    kind: "technique",
    start: at(start),
    end: at(end),
    station,
    pax: 0,
    light: true,
    source: "modele",
    status: "a_attribuer",
    label: `EDF ${id}`,
    ...extra,
  };
}

export const toAgent = (agentId: string) => ({ kind: "agent" as const, agentId });
