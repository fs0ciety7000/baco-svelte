import "server-only";

import type { RecordModel } from "pocketbase";

import type { BillingBus, BillingTaxi } from "@/lib/orders/billing";
import { addDays, brusselsDay, brusselsTime, brusselsToUtc, pbDate } from "@/lib/orders/time";
import { viaList } from "@/lib/orders/via";
import { can } from "@/lib/permissions";
import type { SessionUser } from "@/server/auth";

import { dayToPb, pbForRequest, toPbInstant } from "./orders";

// Récapitulatifs des bons (Commandes › Archives, 4 nov. 2026) : bons terminés, envoyés ou annulés d'une période (date de
// service), lus avec le jeton de l'agent. Source unique du récap par semaine, du zip de la semaine, du PDF mensuel et du
// fichier de facturation. Jamais de nom de voyageur ; cause et n° de dossier PMR seulement avec `pmr:read`.

export const RECAP_STATUSES = ["termine", "envoye", "annule"] as const;
export const RECAP_MAX = 1500;

export const DISTRICT_NAME: Record<string, string> = {
  DSO: "Sud-Ouest",
  DSE: "Sud-Est",
  DCE: "Centre",
};
export const DISTRICT_CODE: Record<string, string> = {
  "Sud-Ouest": "DSO",
  "Sud-Est": "DSE",
  Centre: "DCE",
};

export type RecapData = {
  bus: (BillingBus & { id: string; district: string })[];
  taxi: (BillingTaxi & { id: string; district: string })[];
};

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]) : []);

function author(r: RecordModel): string {
  const e = (r.expand ?? {}) as Record<string, RecordModel | undefined>;
  return (
    str(e.created_by?.name) || str(e.created_by?.username) || str(r.sent_by_name) || str(r.author)
  );
}

function stamp(v: unknown): string {
  const d = pbDate(str(v));
  if (!d) return "";
  const day = brusselsDay(d);
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)} ${brusselsTime(d)}`;
}

function busOf(r: RecordModel): RecapData["bus"][number] {
  const e = (r.expand ?? {}) as Record<string, RecordModel | undefined>;
  return {
    id: r.id,
    district: DISTRICT_CODE[str(r.district)] ?? "",
    orderRef: str(r.order_ref),
    number: num(r.number),
    status: str(r.status),
    day: str(r.order_date).slice(0, 10),
    relation: str(r.relation),
    author: author(r),
    company: str(e.company?.name),
    callTime: str(r.call_time).slice(0, 5),
    buses: arr(r.buses).map((b) => {
      const o = (b ?? {}) as Record<string, unknown>;
      return {
        plate: str(o.plate),
        planned: str(o.planned),
        actual: str(o.actual),
        demob: str(o.demob),
        cancelled: o.cancelled === true,
      };
    }),
    capacity: num(r.bus_capacity),
    passengers: num(r.passengers),
    roundTrip: !!r.round_trip,
    origin: str(r.origin),
    destination: str(r.destination),
    direct: !!r.direct,
    lines: arr(r.lines).filter((x): x is string => typeof x === "string"),
    reason: str(r.reason),
    c3Type: num(r.c3_type),
    cancelReason: str(r.cancel_reason),
  };
}

function taxiOf(r: RecordModel, canPmr: boolean): RecapData["taxi"][number] {
  const e = (r.expand ?? {}) as Record<string, RecordModel | undefined>;
  const at = pbDate(str(r.trip_at));
  const created = pbDate(str(r.created));
  const pmr = !!r.is_pmr;
  return {
    id: r.id,
    district: DISTRICT_CODE[str(r.district)] ?? "",
    orderRef: str(r.order_ref),
    number: num(r.number),
    status: str(r.status),
    requestDay: created ? brusselsDay(created) : "",
    day: at ? brusselsDay(at) : "",
    time: at && !r.time_pending ? brusselsTime(at) : "",
    author: author(r),
    vehicles: num(r.vehicles) || 1,
    company: str(e.taxi_company?.name) || str(r.taxi_name),
    passengers: num(r.passengers),
    from: str(r.from_station),
    to: str(r.to_station),
    vias: viaList(r),
    roundTrip: r.trip_type === "aller-retour" || !!str(r.return_at),
    // Bon PMR : le motif est la cause PMR (avec `pmr:read`) ; jamais le nom du voyageur.
    reason: pmr ? "" : str(r.reason),
    billing: str(r.billing) || "SNCB",
    relation: str(r.relation_number),
    isPmr: pmr,
    pmrReason: pmr && canPmr ? str(r.pmr_reason) : "",
    pmrFile: pmr && canPmr ? str(r.pmr_file) : "",
    cancelReason: str(r.cancel_reason),
    cancelledAt: str(r.status) === "annule" ? stamp(r.cancelled_at) : "",
  };
}

/**
 * Bons d'une période (jours de service `from` → `to` inclus), bus et taxi selon les droits de l'agent ; `districts`
 * (codes) vide = tous. Bornés à `RECAP_MAX` par type.
 */
export async function recapOrders(
  user: SessionUser,
  p: { from: string; to: string; districts?: string[] },
): Promise<RecapData> {
  const pb = await pbForRequest();
  const status = `(${RECAP_STATUSES.map((s) => `status = "${s}"`).join(" || ")})`;
  const names = (p.districts ?? []).map((d) => DISTRICT_NAME[d]).filter((d): d is string => !!d);
  const district = names.length
    ? `(${names.map((n) => pb.filter("district = {:d}", { d: n })).join(" || ")})`
    : "";
  const [bus, taxi] = await Promise.all([
    can(user, "otto:read")
      ? pb.collection("bus_orders").getFullList({
          filter: [
            status,
            pb.filter("order_date >= {:a} && order_date < {:b}", {
              a: dayToPb(p.from),
              b: dayToPb(addDays(p.to, 1)),
            }),
            district,
          ]
            .filter(Boolean)
            .join(" && "),
          sort: "order_date,number",
          expand: "company,created_by",
          fields:
            "id,number,order_ref,status,order_date,call_time,relation,buses,bus_capacity,passengers,round_trip,origin,destination,direct,lines,reason,c3_type,cancel_reason,district,sent_by_name,expand.company.name,expand.created_by.name,expand.created_by.username",
          batch: 500,
        })
      : Promise.resolve([] as RecordModel[]),
    can(user, "generate_taxi:read")
      ? pb.collection("taxi_orders").getFullList({
          filter: [
            status,
            pb.filter("trip_at >= {:a} && trip_at < {:b}", {
              a: toPbInstant(brusselsToUtc(p.from)),
              b: toPbInstant(brusselsToUtc(addDays(p.to, 1))),
            }),
            district,
          ]
            .filter(Boolean)
            .join(" && "),
          sort: "trip_at,number",
          expand: "taxi_company,created_by",
          fields:
            "id,number,order_ref,status,created,trip_at,time_pending,trip_type,return_at,author,vehicles,taxi_name,passengers,from_station,to_station,via_station,via_stations,reason,billing,relation_number,is_pmr,pmr_reason,pmr_file,cancel_reason,cancelled_at,district,expand.taxi_company.name,expand.created_by.name,expand.created_by.username",
          batch: 500,
        })
      : Promise.resolve([] as RecordModel[]),
  ]);
  const canPmr = can(user, "pmr:read");
  return {
    bus: bus.slice(0, RECAP_MAX).map(busOf),
    taxi: taxi.slice(0, RECAP_MAX).map((r) => taxiOf(r, canPmr)),
  };
}

/** Sociétés de bus et de taxi (listes de la feuille « Données »). */
export async function companyNames(user: SessionUser): Promise<{ bus: string[]; taxi: string[] }> {
  const pb = await pbForRequest();
  const names = async (col: string, ok: boolean) =>
    ok
      ? (
          await pb
            .collection(col)
            .getFullList({ fields: "name", sort: "name", batch: 500 })
            .catch(() => [])
        )
          .map((r) => str(r.name).trim())
          .filter(Boolean)
      : [];
  const [bus, taxi] = await Promise.all([
    names("bus_companies", can(user, "otto:read")),
    names("taxi_companies", can(user, "generate_taxi:read")),
  ]);
  return { bus, taxi };
}
