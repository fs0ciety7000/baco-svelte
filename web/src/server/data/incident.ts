import "server-only";

import type { RecordModel } from "pocketbase";

import { plainText } from "@/lib/ops/chat-markdown";
import {
  buildIncident,
  type Incident,
  type IncidentLog,
  type IncidentOrder,
} from "@/lib/ops/incident";
import { addDays, brusselsDay, brusselsTime, pbDate } from "@/lib/orders/time";
import { can } from "@/lib/permissions";
import type { SessionUser } from "@/server/auth";

import { pbForRequest, toPbInstant } from "./orders";

/** Fenêtre des urgences et perturbations du Journal prises en compte (6 h). */
const LOG_WINDOW_MS = 6 * 3600 * 1000;

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Incident en cours pour le bandeau de l'accueil Temps réel (4 nov. 2026) : bons bus du jour « brouillon / en cours »
 * (`otto:read`) et urgences / perturbations iRail des 6 dernières heures (`journal:read`), avec le jeton de l'agent.
 * `null` quand rien n'est en cours ou sans aucun des deux droits ; une erreur de lecture n'empêche jamais l'accueil.
 */
export async function liveIncident(user: SessionUser): Promise<Incident | null> {
  const canBus = can(user, "otto:read");
  const canLog = can(user, "journal:read");
  if (!canBus && !canLog) return null;
  const pb = await pbForRequest();
  const today = brusselsDay(new Date());
  const now = new Date();
  const [busRows, logRows] = await Promise.all([
    canBus
      ? pb
          .collection("bus_orders")
          .getFullList({
            // Jour de service stocké à minuit UTC (convention des bons).
            filter: pb.filter(
              'status = "brouillon" && order_date >= {:from} && order_date < {:to}',
              { from: `${today} 00:00:00.000Z`, to: `${addDays(today, 1)} 00:00:00.000Z` },
            ),
            sort: "call_time",
            fields: "id,status,origin,destination,call_time,reason,passengers,buses",
            batch: 100,
          })
          .catch(() => [] as RecordModel[])
      : Promise.resolve([] as RecordModel[]),
    canLog
      ? pb
          .collection("ops_log")
          .getFullList({
            filter: pb.filter(
              'status = "active" && created >= {:since} && (urgent = true || (source = "irail" && category = "perturbation"))',
              { since: toPbInstant(new Date(now.getTime() - LOG_WINDOW_MS).toISOString()) },
            ),
            sort: "created",
            fields: "id,body,urgent,source,created,occurred_at",
            batch: 100,
          })
          .catch(() => [] as RecordModel[])
      : Promise.resolve([] as RecordModel[]),
  ]);

  const orders: IncidentOrder[] = busRows.map((r) => ({
    id: r.id,
    status: str(r.status),
    origin: str(r.origin),
    destination: str(r.destination),
    callTime: str(r.call_time),
    reason: plainText(str(r.reason)),
    passengers: typeof r.passengers === "number" ? r.passengers : 0,
    buses: Array.isArray(r.buses)
      ? (r.buses as unknown[]).map((b) => {
          const o = (b ?? {}) as { cancelled?: unknown; demob?: unknown };
          return { cancelled: o.cancelled === true, demob: str(o.demob) };
        })
      : [],
  }));
  const logs: IncidentLog[] = logRows.map((r) => {
    const d = pbDate(str(r.occurred_at) || str(r.created));
    return {
      id: r.id,
      time: d ? brusselsTime(d) : "",
      label: plainText(str(r.body)).replace(/\s+/g, " ").slice(0, 200),
      urgent: r.urgent === true,
      irail: r.source === "irail",
    };
  });
  return buildIncident(orders, logs);
}
