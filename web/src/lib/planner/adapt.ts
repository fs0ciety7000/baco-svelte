// Adaptateur unique entre les données du serveur (`server/data/planner.ts`, champs PocketBase relus) et le moteur pur du
// planificateur (`lib/planner/`). Pur et testé (`adapt.test.ts`) : l'écran, les actions et les tests passent tous par ici.
//
// Points d'attention :
// - une prise en charge DICOS arrive avec `start = end = heure du train` : `trainAt` = cette heure et la fenêtre réelle
//   (T−15 → T+5…) est calculée par `taskWindow` / `linkConnections` (copies : l'entrée n'est jamais modifiée) ;
// - une saisie manuelle de l'écran est enregistrée de la même façon (début = fin = heure du train) ; une PMR dont la fin
//   suit le début garde ses heures (fenêtre déjà posée) ;
// - la base d'un agent est le NOM de sa gare de base (Quinyx) : convertie en code (`PlannerBase.code`), comme `covers` ;
// - sources serveur `dicos_mission` / `dicos_pending` → moteur `dicos` / `dicos_attente`.

import type {
  BcsCounter as ServerBcs,
  PlannerAgent as ServerAgent,
  PlannerBase as ServerBase,
  PlannerDay as ServerDay,
  PlannerTask as ServerTask,
} from "@/server/data/planner";

import { linkConnections, stationKey } from "./window";
import type {
  BcsCounter,
  PlannerAgent,
  PlannerBase,
  PlannerContext,
  PlannerPost,
  PlannerTask,
} from "./types";

export type { ServerAgent, ServerBase, ServerBcs, ServerDay, ServerTask };

const POSTS: readonly PlannerPost[] = ["CPI", "SPI", "OPI", "PA", "EXTRA"];

export function toEngineBase(b: ServerBase): PlannerBase {
  return {
    code: b.code,
    name: b.name,
    district: b.district,
    ...(b.zone ? { zone: b.zone } : {}),
    travel: b.travel.map((t) => ({ station: t.station, minutes: t.minutes })),
    covers: [...b.covers],
  };
}

/** Code de base d'après un nom (« Mons », « LIEGE GUILLEMINS ») ou un code (« FMS ») ; "" si inconnu. */
export function baseCodeOf(
  nameOrCode: string,
  bases: readonly Pick<ServerBase, "code" | "name">[],
) {
  const raw = nameOrCode.trim();
  if (!raw) return "";
  const up = raw.toUpperCase();
  const k = stationKey(raw);
  return (
    (bases.find((b) => b.code.toUpperCase() === up) ?? bases.find((b) => stationKey(b.name) === k))
      ?.code ?? ""
  );
}

export function toEngineAgent(a: ServerAgent, bases: readonly ServerBase[]): PlannerAgent {
  const post = (POSTS as readonly string[]).includes(a.post)
    ? (a.post as PlannerPost)
    : ((a.shifts.find((s) => (POSTS as readonly string[]).includes(s.post))?.post as
        PlannerPost | undefined) ?? "EXTRA");
  const base =
    baseCodeOf(a.base, bases) ||
    a.shifts.map((s) => baseCodeOf(s.base, bases)).find(Boolean) ||
    a.base;
  return {
    id: a.id,
    name: a.name,
    post,
    base,
    shifts: a.shifts.filter((s) => s.start && s.end).map((s) => ({ start: s.start, end: s.end })),
  };
}

const SOURCE: Record<string, PlannerTask["source"]> = {
  dicos_mission: "dicos",
  dicos_pending: "dicos_attente",
  manuel: "manuel",
  modele: "modele",
};

const isPmrKind = (k: string) => k === "pmr_in" || k === "pmr_out";

/** Tâche du moteur (fenêtre NON encore calculée : `linkConnections` s'en charge). */
export function toEngineTask(t: ServerTask): PlannerTask {
  const pmr = isPmrKind(t.kind);
  const startMs = Date.parse(t.start);
  const endMs = Date.parse(t.end || t.start);
  // Heure du train : PMR dont la fin ne suit pas le début (DICOS, saisie de l'écran).
  const trainAt = pmr && !(endMs > startMs) ? t.start : undefined;
  const out: PlannerTask = {
    id: t.id,
    day: t.day,
    kind: t.kind,
    ...(trainAt ? { trainAt } : {}),
    start: t.start,
    end: t.end || t.start,
    station: t.station,
    ...(t.otherStation ? { otherStation: t.otherStation } : {}),
    ...(t.train ? { train: t.train } : {}),
    ...(t.pmrType ? { pmrType: t.pmrType } : {}),
    pax: pmr ? Math.max(1, t.pax || 0) : t.pax || 0,
    light: t.light,
    ...(t.dossier ? { dossier: t.dossier } : {}),
    source: SOURCE[t.source] ?? t.source,
    ...(t.dicosStatus ? { dicosStatus: t.dicosStatus } : {}),
    status: t.status,
    ...(t.linkKey ? { linkKey: t.linkKey } : {}),
    ...(t.label ? { label: t.label } : {}),
  };
  if (t.assigneeKind)
    out.assignee = {
      kind: t.assigneeKind,
      ...(t.assigneeKind === "agent" && t.assigneeAgent ? { agentId: t.assigneeAgent } : {}),
      ...(t.assigneeLabel ? { label: t.assigneeLabel } : {}),
    };
  return out;
}

export function toEngineBcs(c: ServerBcs, bases: readonly ServerBase[]): BcsCounter {
  return {
    station: c.station,
    ...(c.weekdayHours ? { weekdayHours: c.weekdayHours } : {}),
    ...(c.weekendHours ? { weekendHours: c.weekendHours } : {}),
    perHour: c.perHour || 3,
    lightOnly: c.lightOnly,
    base: baseCodeOf(c.base, bases) || c.base,
  };
}

export type AdaptedDay = {
  day: string;
  /** Contexte du moteur : tâches avec fenêtres et liens calculés (`linkConnections`). */
  ctx: PlannerContext;
  /** Tâches du moteur par identifiant. */
  byId: Map<string, PlannerTask>;
  /** Fiches du serveur par identifiant (verrou `updated`, district, source brute, statut DICOS…). */
  server: Map<string, ServerTask>;
};

/** Journée du serveur → contexte du moteur (nouveaux objets à chaque appel : les caches du moteur sont par objet). */
export function adaptDay(
  data: Pick<ServerDay, "day" | "bases" | "agents" | "tasks" | "bcs">,
): AdaptedDay {
  const bases = data.bases.map(toEngineBase);
  const tasks = linkConnections(data.tasks.map(toEngineTask));
  return {
    day: data.day,
    ctx: {
      tasks,
      agents: data.agents.map((a) => toEngineAgent(a, data.bases)),
      bases,
      bcs: data.bcs.map((c) => toEngineBcs(c, data.bases)),
    },
    byId: new Map(tasks.map((t) => [t.id, t])),
    server: new Map(data.tasks.map((t) => [t.id, t])),
  };
}

export type DuplicatePair = { manualId: string; dicosId: string };

/**
 * Doublons probables : une tâche saisie à la main (ou d'un modèle) qui correspond à une tâche DICOS (même dossier, même
 * train, même sens, même gare). Une tâche manuelle n'apparaît qu'une fois (première tâche DICOS trouvée).
 */
export function findDuplicates(tasks: readonly ServerTask[]): DuplicatePair[] {
  const key = (t: ServerTask) =>
    t.dossier && isPmrKind(t.kind)
      ? `${t.dossier}|${t.train.replace(/\s+/g, "").toUpperCase()}|${t.kind}|${t.stationKey || stationKey(t.station)}`
      : "";
  const dicos = new Map<string, string>();
  for (const t of tasks)
    if (t.source === "dicos_mission" || t.source === "dicos_pending") {
      const k = key(t);
      if (k && !dicos.has(k)) dicos.set(k, t.id);
    }
  const out: DuplicatePair[] = [];
  for (const t of tasks) {
    if (t.source !== "manuel" && t.source !== "modele") continue;
    const k = key(t);
    const d = k ? dicos.get(k) : undefined;
    if (d) out.push({ manualId: t.id, dicosId: d });
  }
  return out;
}
