import "server-only";

import type PocketBase from "pocketbase";

import {
  computeTasks,
  parseHours,
  type ConnectorTask,
  type SyncHealth,
  type LeaseStore,
  type TaskKind,
  type TaskOutcome,
} from "@/lib/connector/tasks";
import { addDays, brusselsDay, brusselsTime, pbDate } from "@/lib/orders/time";

import { createPb } from "./pocketbase";
import { ingestConfigured, serviceAuth } from "./dicos-service";

// Synchro automatique par l'extension (4 nov. 2026) : état en mémoire du serveur Next (une seule instance par
// environnement, comme la présence en direct) — baux des tâches et dernier passage par type. Perdu au redémarrage : sans
// conséquence (un bail dure 10 min, la fraîcheur se relit dans PocketBase). Registre sur `globalThis` : la route et les
// pages chargent deux copies du module.

type Registry = { leases: LeaseStore; last: Partial<Record<TaskKind, TaskOutcome>> };
const g = globalThis as typeof globalThis & { __csmConnectorTasks?: Registry };
export const registry: Registry = (g.__csmConnectorTasks ??= { leases: new Map(), last: {} });

/** Heure à Bruxelles (0-23). */
function brusselsHour(d: Date): number {
  return Number(brusselsTime(d).slice(0, 2));
}

export type SyncFreshness = {
  today: string;
  tomorrow: string;
  dicos: Record<string, Date | null>;
  /** Plus ancienne synchro réussie des groupes Quinyx activés ; `undefined` = aucun groupe activé. */
  quinyx: Date | null | undefined;
};

/** Fraîcheur des synchros, lue avec le compte de service (qui lit `dicos_syncs` et `quinyx_groups`). */
export async function readFreshness(pb: PocketBase, now = new Date()): Promise<SyncFreshness> {
  const today = brusselsDay(now);
  const tomorrow = addDays(today, 1);
  const lastComplete = async (day: string) => {
    const r = await pb
      .collection("dicos_syncs")
      .getList(1, 1, {
        filter: pb.filter('day = {:d} && kind = "missions" && complete = true', { d: day }),
        sort: "-created",
        fields: "created",
      })
      .catch(() => null);
    return r?.items[0] ? pbDate(String(r.items[0].created)) : null;
  };
  const [d0, d1, groups] = await Promise.all([
    lastComplete(today),
    lastComplete(tomorrow),
    pb
      .collection("quinyx_groups")
      .getFullList({ filter: "enabled = true", fields: "last_sync" })
      .catch(() => null),
  ]);
  let quinyx: Date | null | undefined;
  if (groups && groups.length) {
    const dates = groups.map((x) => pbDate(String(x.last_sync ?? "")));
    quinyx = dates.some((d) => !d)
      ? null
      : new Date(Math.min(...dates.map((d) => (d as Date).getTime())));
  }
  return { today, tomorrow, dicos: { [today]: d0, [tomorrow]: d1 }, quinyx };
}

/** Tâches à faire maintenant (avant le filtre des baux). */
export async function currentTasks(pb: PocketBase, now = new Date()): Promise<ConnectorTask[]> {
  const f = await readFreshness(pb, now);
  return computeTasks({
    ...f,
    now,
    hour: brusselsHour(now),
    hours: parseHours(process.env.CSM_AUTO_SYNC_HOURS ?? process.env.CSM_DICOS_ALERT_HOURS),
  });
}

/**
 * État des synchros pour l'écran commun et le Temps réel : aucune donnée nominative. Lu avec le compte de service ;
 * `null` si l'ingestion n'est pas configurée ou si PocketBase ne répond pas.
 */
export async function syncHealth(now = new Date()): Promise<SyncHealth | null> {
  if (!ingestConfigured()) return null;
  try {
    const svc = await serviceAuth();
    const pb = createPb(svc.token);
    const f = await readFreshness(pb, now);
    const tasks = computeTasks({
      ...f,
      now,
      hour: brusselsHour(now),
      hours: parseHours(process.env.CSM_AUTO_SYNC_HOURS ?? process.env.CSM_DICOS_ALERT_HOURS),
    });
    const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
    const out = (o: TaskOutcome | undefined) =>
      o ? { at: new Date(o.at).toISOString(), ok: o.ok, code: o.code } : null;
    return {
      dicos: { at: iso(f.dicos[f.today]), tomorrowAt: iso(f.dicos[f.tomorrow]) },
      quinyx: { at: iso(f.quinyx), enabled: f.quinyx !== undefined },
      auto: { dicos: out(registry.last.dicos), quinyx: out(registry.last.quinyx) },
      pending: tasks.map((t) => ({ id: t.id, reason: t.reason })),
    };
  } catch {
    return null;
  }
}
