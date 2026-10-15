// Journée d'un agent : tâches, trajets calculés (« Départ vers X », enchaînements, « Retour à <base> »), temps libres,
// occupation du service (REGLES §2.3, §6.4).

import { MINUTE, toIso } from "./time";
import {
  norm,
  occupies,
  serviceIntervals,
  serviceMinutes,
  unionMinutes,
  type Interval,
  type Norm,
} from "./core";
import { baseByCode, travelMinutes } from "./travel";
import { stationKey as keyOf } from "./window";
import {
  DEFAULT_PLANNER_SETTINGS,
  type PlannerAgent,
  type PlannerBase,
  type PlannerSettings,
  type PlannerTask,
} from "./types";

export type TimelineItem =
  | { type: "task"; task: PlannerTask; start: string; end: string; outOfService: boolean }
  | {
      type: "trajet";
      label: string;
      from: string;
      to: string;
      start: string;
      end: string;
      /** null : trajet inconnu (gare hors de la couverture de la base). */
      minutes: number | null;
      /** Le trajet empiète sur la tâche précédente ou commence avant le service. */
      conflict: boolean;
    }
  | { type: "libre"; start: string; end: string; minutes: number };

export type AgentTimeline = {
  agentId: string;
  items: TimelineItem[];
  serviceMinutes: number;
  /** Minutes occupées (tâches + trajets, chevauchements comptés une fois, dans le service). */
  busyMinutes: number;
  freeMinutes: number;
  /** Occupation du service en % (0-100, arrondi). */
  occupancy: number;
};

/** Tâches attribuées à l'agent (hors trajets et annulées). */
export function agentTasks(agentId: string, tasks: PlannerTask[]): Norm[] {
  return tasks
    .filter((t) => t.assignee?.kind === "agent" && t.assignee.agentId === agentId)
    .map(norm)
    .filter(occupies)
    .sort((a, b) => a.s - b.s || a.e - b.e);
}

/**
 * Séquence ordonnée de la journée, service par service (prestations contiguës fusionnées). L'agent part de sa base au
 * début du service ; chaque changement de gare ajoute un trajet qui finit au début de la tâche suivante ; après la
 * dernière tâche hors base, « Retour à <base> » commence à sa fin. Une tâche hors service est listée (`outOfService`)
 * sans trajet.
 */
export function agentTimeline(
  agent: PlannerAgent,
  tasks: PlannerTask[],
  bases: PlannerBase[],
  settings: PlannerSettings = DEFAULT_PLANNER_SETTINGS,
): AgentTimeline {
  void settings; // réservé (durées des tâches techniques, pauses) : les fenêtres sont déjà dans les tâches.
  const base = baseByCode(bases, agent.base);
  const home = base?.name ?? agent.base;
  const service = serviceIntervals(agent);
  const mine = agentTasks(agent.id, tasks);
  const items: (TimelineItem & { _s: number })[] = [];
  const busy: Interval[] = [];
  const used = new Set<Norm>();

  const travel = (a: string, b: string) => travelMinutes(agent.base, a, b, bases);

  for (const iv of service) {
    const inside = mine.filter((n) => n.s >= iv.s && n.s < iv.e);
    let where = home;
    let freeFrom = iv.s;
    let lastEnd = iv.s;
    for (const n of inside) {
      used.add(n);
      if (n.st !== keyOf(where)) {
        const m = travel(where, n.task.station);
        const dur = (m ?? 0) * MINUTE;
        const ts = n.s - dur;
        const label =
          keyOf(where) === keyOf(home)
            ? `Départ vers ${n.task.station}`
            : keyOf(n.task.station) === keyOf(home)
              ? `Retour à ${home}`
              : `Trajet vers ${n.task.station}`;
        pushFree(items, freeFrom, Math.min(ts, n.s));
        items.push({
          _s: ts,
          type: "trajet",
          label,
          from: where,
          to: n.task.station,
          start: toIso(ts),
          end: toIso(n.s),
          minutes: m,
          conflict: m === null || ts < lastEnd,
        });
        busy.push({ s: Math.max(ts, iv.s), e: n.s });
        freeFrom = Math.max(freeFrom, n.s);
      }
      pushFree(items, freeFrom, n.s);
      items.push({
        _s: n.s,
        type: "task",
        task: n.task,
        start: n.task.start,
        end: n.task.end,
        outOfService: n.e > iv.e,
      });
      busy.push({ s: n.s, e: Math.min(n.e, iv.e) });
      freeFrom = Math.max(freeFrom, n.e);
      lastEnd = Math.max(lastEnd, n.e);
      where = n.task.station;
    }
    if (keyOf(where) !== keyOf(home)) {
      const m = travel(where, home);
      const te = lastEnd + (m ?? 0) * MINUTE;
      items.push({
        _s: lastEnd,
        type: "trajet",
        label: `Retour à ${home}`,
        from: where,
        to: home,
        start: toIso(lastEnd),
        end: toIso(te),
        minutes: m,
        conflict: m === null || te > iv.e,
      });
      busy.push({ s: lastEnd, e: Math.min(te, iv.e) });
      freeFrom = Math.max(freeFrom, te);
    }
    pushFree(items, freeFrom, iv.e);
  }
  for (const n of mine) {
    if (used.has(n)) continue;
    items.push({
      _s: n.s,
      type: "task",
      task: n.task,
      start: n.task.start,
      end: n.task.end,
      outOfService: true,
    });
  }
  items.sort((a, b) => a._s - b._s);
  const svc = serviceMinutes(service);
  const busyMin = Math.min(svc, unionMinutes(busy.filter((x) => x.e > x.s)));
  return {
    agentId: agent.id,
    items: items.map(({ _s, ...rest }) => {
      void _s;
      return rest as TimelineItem;
    }),
    serviceMinutes: svc,
    busyMinutes: busyMin,
    freeMinutes: Math.max(0, svc - busyMin),
    occupancy: svc > 0 ? Math.round((busyMin / svc) * 100) : 0,
  };
}

function pushFree(items: (TimelineItem & { _s: number })[], from: number, to: number) {
  const minutes = Math.floor((to - from) / MINUTE);
  if (minutes >= 1)
    items.push({ _s: from, type: "libre", start: toIso(from), end: toIso(to), minutes });
}
