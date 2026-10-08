import "server-only";

import type { RecordModel } from "pocketbase";
import { z } from "zod";

import { aggregate, normalizeReason, type StatAssist, type StatOrder } from "@/lib/ops/stats";
import { addDays, brusselsDay, brusselsToUtc, dayOf, isValidDay, pbDate } from "@/lib/orders/time";

import { pbForRequest, toPbInstant } from "./orders";

// Statistiques : lecture avec le jeton de l'agent (seules les commandes qu'il peut lire comptent), agrégats calculés
// ici ; le navigateur ne reçoit que les totaux. Prestations PMR : comptage anonyme, seulement avec deplacements:read.

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const exp = (r: RecordModel) => (r.expand ?? {}) as Record<string, RecordModel | undefined>;

export const statsFilterSchema = z.object({
  du: z.string().refine(isValidDay).optional().catch(undefined),
  au: z.string().refine(isValidDay).optional().catch(undefined),
  district: z.enum(["Sud-Ouest", "Sud-Est", "Centre"]).optional().catch(undefined),
  type: z.enum(["1", "2", "3"]).optional().catch(undefined),
  societe: z
    .string()
    .regex(/^[a-z0-9]{15}$/)
    .optional()
    .catch(undefined),
});
export type StatsFilters = z.input<typeof statsFilterSchema>;

export function statsPeriod(f: z.output<typeof statsFilterSchema>) {
  const today = brusselsDay();
  const from = f.du ?? addDays(today, -29);
  let to = f.au && f.au >= from ? f.au : today;
  // 2 ans au plus.
  if (to > addDays(from, 730)) to = addDays(from, 730);
  return { from, to };
}

const ms = (v: unknown) => pbDate(str(v))?.getTime() ?? 0;

export async function loadStats(input: StatsFilters, ctx: { canTaxi: boolean; canPmr: boolean }) {
  const f = statsFilterSchema.parse(input);
  const { from, to } = statsPeriod(f);
  const pb = await pbForRequest();
  const busParts = [
    pb.filter("order_date >= {:a} && order_date <= {:b}", {
      a: `${from} 00:00:00.000Z`,
      b: `${to} 00:00:00.000Z`,
    }),
  ];
  if (f.district) busParts.push(pb.filter("district = {:d}", { d: f.district }));
  if (f.type) busParts.push(pb.filter("c3_type = {:t}", { t: Number(f.type) }));
  if (f.societe) busParts.push(pb.filter("company = {:c}", { c: f.societe }));
  const busItems = await pb.collection("bus_orders").getFullList({
    filter: busParts.join(" && "),
    fields:
      "id,order_date,status,district,company,c3_type,buses,bus_count,origin,destination,lines,reason,sent_at,confirmed_at,expand.company.name",
    expand: "company",
    batch: 1000,
  });
  const orders: StatOrder[] = busItems.map((r) => {
    const list = Array.isArray(r.buses) ? (r.buses as { cancelled?: boolean }[]) : [];
    const active = list.filter((b) => !b?.cancelled).length;
    return {
      kind: "bus",
      day: str(r.order_date).slice(0, 10),
      status: str(r.status),
      district: str(r.district),
      company: str(exp(r).company?.name),
      c3Type: num(r.c3_type),
      buses: list.length ? active : num(r.bus_count),
      route: `${str(r.origin) || "?"} → ${str(r.destination) || "?"}`,
      lines: Array.isArray(r.lines)
        ? (r.lines as unknown[]).filter((l): l is string => typeof l === "string")
        : [],
      reason: normalizeReason(str(r.reason)),
      sentAt: ms(r.sent_at),
      confirmedAt: ms(r.confirmed_at),
    };
  });
  // Taxis : sans filtre de type C3 ni de société de bus (non applicables).
  if (ctx.canTaxi && !f.type && !f.societe) {
    const parts = [
      pb.filter("trip_at >= {:a} && trip_at < {:b}", {
        a: toPbInstant(brusselsToUtc(from)),
        b: toPbInstant(brusselsToUtc(addDays(to, 1))),
      }),
    ];
    if (f.district) parts.push(pb.filter("district = {:d}", { d: f.district }));
    const taxis = await pb.collection("taxi_orders").getFullList({
      filter: parts.join(" && "),
      fields:
        "id,trip_at,status,district,taxi_name,from_station,to_station,reason,sent_at,confirmed_at",
      batch: 1000,
    });
    for (const t of taxis)
      orders.push({
        kind: "taxi",
        day: dayOf(str(t.trip_at)),
        status: str(t.status),
        district: str(t.district),
        company: str(t.taxi_name),
        c3Type: 0,
        buses: 0,
        route: `${str(t.from_station) || "?"} → ${str(t.to_station) || "?"}`,
        lines: [],
        reason: normalizeReason(str(t.reason)),
        sentAt: ms(t.sent_at),
        confirmedAt: ms(t.confirmed_at),
      });
  }
  let assists: StatAssist[] | null = null;
  if (ctx.canPmr) {
    const items = await pb.collection("pmr_assists").getFullList({
      // District : celui de la zone de la prestation.
      filter: pb.filter(
        `day >= {:a} && day <= {:b}${f.district ? " && zone.district = {:d}" : ""}`,
        { a: from, b: to, d: f.district ?? "" },
      ),
      fields: "day,station,pmr_type,status,pax",
      batch: 1000,
    });
    assists = items.map((a) => ({
      day: str(a.day),
      station: str(a.station),
      type: str(a.pmr_type),
      status: str(a.status),
      pax: num(a.pax),
    }));
  }
  const companies = await pb
    .collection("bus_companies")
    .getFullList({ sort: "name", fields: "id,name" })
    .then((l) => l.map((c) => ({ id: c.id, name: str(c.name) })))
    .catch(() => []);
  return { from, to, filters: f, stats: aggregate(orders, assists, from, to), companies };
}
