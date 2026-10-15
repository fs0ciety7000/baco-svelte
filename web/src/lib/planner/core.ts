// Outils internes du moteur : tâches normalisées (millisecondes, clés de gare), services fusionnés, occupation.

import { MINUTE, toMs } from "./time";
import { isCancelled, isPmr, pmrCategory, stationKey, trainNorm } from "./window";
import type { PlannerAgent, PlannerTask } from "./types";

export type Norm = {
  task: PlannerTask;
  /** Début / fin (ms). */
  s: number;
  e: number;
  /** Heure du train (ms) ou NaN. */
  T: number;
  /** Clé de gare. */
  st: string;
  train: string;
  link: string;
  cancelled: boolean;
  chair: boolean;
  pmr: boolean;
};

const norms = new WeakMap<PlannerTask, Norm>();

export function norm(task: PlannerTask): Norm {
  let n = norms.get(task);
  if (n) return n;
  const s = toMs(task.start);
  const e = toMs(task.end);
  n = {
    task,
    s,
    e: Number.isNaN(e) || e < s ? s : e,
    T: toMs(task.trainAt),
    st: stationKey(task.station),
    train: trainNorm(task.train),
    link: task.linkKey ?? "",
    cancelled: isCancelled(task),
    chair: isPmr(task) && pmrCategory(task) === "wheelchair",
    pmr: isPmr(task),
  };
  norms.set(task, n);
  return n;
}

/** Heure de référence d'une tâche (train, sinon début). */
export const refTime = (n: Norm) => (Number.isNaN(n.T) ? n.s : n.T);

/** Tâche qui occupe un agent (ni trajet, ni annulée, horaires lisibles). */
export const occupies = (n: Norm) => n.task.kind !== "trajet" && !n.cancelled && !Number.isNaN(n.s);

/** Même train à la même gare : plusieurs PMR permises en même temps (réponse de l'utilisateur, §4). */
export const sameTrainStop = (a: Norm, b: Norm) =>
  !!a.train && a.train === b.train && a.st === b.st;

export type Interval = { s: number; e: number };

/** Prestations triées et fusionnées quand elles se touchent (06-14 puis 14-22 = un seul service). */
export function serviceIntervals(agent: Pick<PlannerAgent, "shifts">): Interval[] {
  const list = agent.shifts
    .map((x) => ({ s: toMs(x.start), e: toMs(x.end) }))
    .filter((x) => !Number.isNaN(x.s) && !Number.isNaN(x.e) && x.e > x.s)
    .sort((a, b) => a.s - b.s);
  const out: Interval[] = [];
  for (const x of list) {
    const last = out[out.length - 1];
    if (last && x.s <= last.e) last.e = Math.max(last.e, x.e);
    else out.push({ ...x });
  }
  return out;
}

/** Minutes couvertes par l'union des intervalles. */
export function unionMinutes(items: Interval[]): number {
  const sorted = [...items].sort((a, b) => a.s - b.s);
  let total = 0;
  let cs = Number.NaN;
  let ce = Number.NaN;
  for (const x of sorted) {
    if (Number.isNaN(cs) || x.s > ce) {
      if (!Number.isNaN(cs)) total += ce - cs;
      cs = x.s;
      ce = x.e;
    } else if (x.e > ce) ce = x.e;
  }
  if (!Number.isNaN(cs)) total += ce - cs;
  return Math.round(total / MINUTE);
}

export const serviceMinutes = (iv: Interval[]) =>
  Math.round(iv.reduce((a, x) => a + (x.e - x.s), 0) / MINUTE);
