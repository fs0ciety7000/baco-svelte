import "server-only";

import { z } from "zod";

import { can } from "@/lib/permissions";
import { addDays, periodOf, type Period } from "@/lib/orders/time";

import type { SessionUser } from "../auth";
import { listOrders, pbForRequest, type OrderRow } from "./orders";

// Remise de service B201 : une par jour (Europe/Brussels), transports lus depuis les commandes du jour
// (statut ≠ brouillon et ≠ annulé ; un bus annulé n'apparaît pas — décision du 8 octobre 2026).

export const SERVICES = [
  { id: "bus", label: "Bus" },
  { id: "taxi", label: "Taxis" },
  { id: "taxi_pmr", label: "Taxis PMR" },
] as const;
export type Service = (typeof SERVICES)[number]["id"];

export type B201Entry = {
  key: string;
  period: Period;
  service: Service;
  time: string;
  company: string;
  origin: string;
  destination: string;
  ref: string;
  /** Lien vers la commande ; absent pour une saisie manuelle. */
  orderId?: string;
  kind?: "bus" | "taxi";
  number?: number;
  status?: OrderRow["status"];
  district: string;
};

export const manualEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9]{6,20}$/),
  period: z.enum(["matin", "apres_midi", "nuit"]),
  service: z.enum(["bus", "taxi", "taxi_pmr"]),
  time: z.string().regex(/^$|^\d{2}:\d{2}$/),
  company: z.string().trim().max(200),
  origin: z.string().trim().max(200),
  destination: z.string().trim().max(200),
  ref: z.string().trim().max(200),
});
export type ManualEntry = z.infer<typeof manualEntrySchema>;

export const notesSchema = z.object({
  matin: z.string().max(5000).default(""),
  apres_midi: z.string().max(5000).default(""),
  nuit: z.string().max(5000).default(""),
  suivant: z.string().max(5000).default(""),
});
export type B201Notes = z.infer<typeof notesSchema>;

type BusLine = { planned?: string; confirmed?: string; cancelled?: boolean };

/** Une ligne par bus actif (heure confirmée sinon prévue), une ligne par taxi. */
function entriesFromRows(rows: OrderRow[], buses: Map<string, BusLine[]>): B201Entry[] {
  const out: B201Entry[] = [];
  for (const r of rows) {
    if (r.status === "brouillon" || r.status === "annule") continue;
    if (r.kind === "bus") {
      const list = (buses.get(r.id) ?? []).filter((b) => !b.cancelled);
      const lines = list.length ? list : [{ planned: r.time }];
      lines.forEach((b, i) => {
        const time = b.confirmed || b.planned || r.time;
        out.push({
          key: `bus-${r.id}-${i}`,
          period: periodOf(time),
          service: "bus",
          time,
          company: r.company,
          origin: r.origin,
          destination: r.destination,
          ref: r.relation,
          orderId: r.id,
          kind: "bus",
          number: r.number,
          status: r.status,
          district: r.district,
        });
      });
    } else {
      out.push({
        key: `taxi-${r.id}`,
        period: periodOf(r.time),
        service: r.isPmr ? "taxi_pmr" : "taxi",
        time: r.time,
        company: r.company,
        origin: r.origin,
        destination: r.destination,
        ref: r.relation,
        orderId: r.id,
        kind: "taxi",
        number: r.number,
        status: r.status,
        district: r.district,
      });
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

export async function b201Data(day: string, district: string | undefined, user: SessionUser) {
  const ctx = {
    userId: user.id,
    canBus: can(user, "otto:read"),
    canTaxi: can(user, "generate_taxi:read"),
  };
  const pb = await pbForRequest();
  // La nuit (21 h – 6 h) déborde sur le lendemain matin : on lit aussi le lendemain avant 6 h.
  const [{ rows }, report] = await Promise.all([
    listOrders({ kind: "all", from: day, to: addDays(day, 1), district, limit: 500 }, ctx),
    pb
      .collection("b201_reports")
      .getFirstListItem(pb.filter("day = {:day}", { day }))
      .catch(() => null),
  ]);
  // Les bus viennent de la liste (pas de 2e requête : un filtre « id = … || … » casse au-delà de ~130 ids).
  const buses = new Map<string, BusLine[]>(
    rows.filter((r) => r.kind === "bus").map((r) => [r.id, r.buses]),
  );
  const all = entriesFromRows(rows, buses).filter((e) => {
    const orderDay = rows.find((r) => r.id === e.orderId)?.day;
    // Avant 6 h : fin de la nuit de la veille ; elle figure sur la B201 du jour précédent.
    if (orderDay === day) return !(e.time && e.time < "06:00");
    // Lendemain : seulement la fin de nuit (avant 6 h).
    return orderDay === addDays(day, 1) && e.period === "nuit" && e.time < "06:00";
  });
  const manual = z
    .array(manualEntrySchema)
    .catch([])
    .parse(report?.manual ?? []);
  return {
    entries: all,
    manual,
    notes: notesSchema.catch(notesSchema.parse({})).parse(report?.notes ?? {}),
    reportId: report?.id ?? null,
    updated: (report?.updated as string | undefined) ?? null,
    hasLegacy: !!report && report.legacy && Object.keys(report.legacy as object).length > 0,
  };
}
export type B201Data = Awaited<ReturnType<typeof b201Data>>;

export const SERVICE_LABEL: Record<Service, string> = {
  bus: "Bus",
  taxi: "Taxi",
  taxi_pmr: "Taxi PMR",
};

/** Transports par période (commandes + saisies manuelles), triés par heure. */
export function entriesByPeriod(data: Pick<B201Data, "entries" | "manual">) {
  const manual: B201Entry[] = data.manual.map((m) => ({
    ...m,
    key: `manuel-${m.id}`,
    district: "",
  }));
  const all = [...data.entries, ...manual].sort((a, b) => a.time.localeCompare(b.time));
  return {
    matin: all.filter((e) => e.period === "matin"),
    apres_midi: all.filter((e) => e.period === "apres_midi"),
    nuit: all.filter((e) => e.period === "nuit"),
  };
}
