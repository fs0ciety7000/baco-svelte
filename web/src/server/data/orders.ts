import "server-only";

import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { cache } from "react";
import { z } from "zod";

import {
  busDraftSchema,
  parseEmails,
  taxiDraftSchema,
  type BusDraft,
  type TaxiDraft,
} from "@/lib/orders/schemas";
import { isStatus, type OrderKind, type Status } from "@/lib/orders/status";
import {
  addDays,
  brusselsDay,
  brusselsTime,
  brusselsToUtc,
  isValidDay,
  pbDate,
} from "@/lib/orders/time";

import { createPb } from "../pocketbase";
import { readSessionToken } from "../session";

// Accès aux commandes bus et taxi, toujours avec le jeton de l'agent (règles PocketBase).
// Convention : `bus_orders.order_date` = jour de service à minuit UTC (« 2026-10-08 00:00:00.000Z »),
// `taxi_orders.trip_at` = instant réel (UTC), affiché à Bruxelles.

export async function pbForRequest(): Promise<PocketBase> {
  return createPb(await readSessionToken());
}

export const COLLECTION: Record<OrderKind, "bus_orders" | "taxi_orders"> = {
  bus: "bus_orders",
  taxi: "taxi_orders",
};

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const strings = (v: unknown) => arr(v).filter((x): x is string => typeof x === "string");

/** Instant ISO → format PocketBase (« 2026-10-08 22:00:00.000Z »). */
export function toPbInstant(iso: string): string {
  return iso.replace("T", " ");
}

export function dayToPb(day: string): string {
  return day ? `${day} 00:00:00.000Z` : "";
}

type Person = { id: string; name: string };
function person(rec: RecordModel, field: string): Person | null {
  const e = (rec.expand as Record<string, RecordModel | undefined> | undefined)?.[field];
  if (!e) return null;
  return { id: e.id, name: str(e.name) || str(e.username) || "Agent" };
}

/** Métadonnées communes (en-tête, panneau, historique). */
export type OrderMeta = {
  kind: OrderKind;
  id: string;
  number: number;
  status: Status;
  statusBeforeCancel: string;
  cancelReason: string;
  createdBy: Person | null;
  created: string;
  updated: string;
  sentAt: string;
  sentBy: Person | null;
  confirmedAt: string;
  confirmedBy: Person | null;
  startedAt: string;
  endedAt: string;
  cancelledAt: string;
};

const PEOPLE = "created_by,sent_by,confirmed_by,cancelled_by";

function meta(kind: OrderKind, r: RecordModel): OrderMeta {
  return {
    kind,
    id: r.id,
    number: num(r.number),
    status: isStatus(r.status) ? r.status : "brouillon",
    statusBeforeCancel: str(r.status_before_cancel),
    cancelReason: str(r.cancel_reason),
    createdBy: person(r, "created_by"),
    created: str(r.created),
    updated: str(r.updated),
    sentAt: str(r.sent_at),
    sentBy: person(r, "sent_by"),
    confirmedAt: str(r.confirmed_at),
    confirmedBy: person(r, "confirmed_by"),
    startedAt: str(r.started_at),
    endedAt: str(r.ended_at),
    cancelledAt: str(r.cancelled_at),
  };
}

// ---------------------------------------------------------------------------------------------------
// Bus

export function busDraftFromRecord(r: RecordModel): BusDraft {
  return busDraftSchema.parse({
    c3_type: num(r.c3_type) || 2,
    reason: str(r.reason),
    order_date: str(r.order_date).slice(0, 10),
    call_time: str(r.call_time).slice(0, 5),
    relation: str(r.relation),
    origin: str(r.origin),
    destination: str(r.destination),
    direct: !!r.direct,
    round_trip: !!r.round_trip,
    lines: strings(r.lines),
    stops: strings(r.stops),
    stops_mode: r.stops_mode === "manuel" ? "manuel" : "auto",
    stops_manual: str(r.stops_manual),
    company: str(r.company),
    bus_capacity: num(r.bus_capacity),
    passengers: num(r.passengers),
    pmr_count: num(r.pmr_count),
    buses: arr(r.buses).length ? arr(r.buses) : undefined,
    district: str(r.district),
    notes: str(r.notes),
  });
}

/** Champs PocketBase d'un brouillon bus (`bus_count` = bus non annulés). */
export function busDraftToRecord(d: BusDraft): Record<string, unknown> {
  return {
    ...d,
    order_date: dayToPb(d.order_date),
    bus_count: d.buses.filter((b) => !b.cancelled).length,
    company: d.company || null,
    district: d.district || null,
  };
}

export async function getBusOrder(id: string) {
  const pb = await pbForRequest();
  const r = await pb.collection("bus_orders").getOne(z.string().min(15).max(36).parse(id), {
    expand: `${PEOPLE},company`,
  });
  const company = (r.expand as Record<string, RecordModel | undefined> | undefined)?.company;
  return {
    meta: meta("bus", r),
    draft: busDraftFromRecord(r),
    company: company
      ? {
          id: company.id,
          name: str(company.name),
          email: str(company.email),
          phone: str(company.phone),
          address: str(company.address),
        }
      : null,
  };
}
export type BusOrderDetail = Awaited<ReturnType<typeof getBusOrder>>;

// ---------------------------------------------------------------------------------------------------
// Taxi

function splitInstant(v: unknown): { day: string; time: string } {
  const d = pbDate(str(v));
  return d ? { day: brusselsDay(d), time: brusselsTime(d) } : { day: "", time: "" };
}

export function taxiDraftFromRecord(r: RecordModel): TaxiDraft {
  const trip = splitInstant(r.trip_at);
  // Heure non saisie : trip_at porte le jour à minuit, l'heure reste vide (jamais « 00:00 » par défaut).
  if (r.time_pending) trip.time = "";
  const ret = splitInstant(r.return_at);
  return taxiDraftSchema.parse({
    trip_day: trip.day,
    trip_time: trip.time,
    round_trip: r.trip_type === "aller-retour" || !!ret.day,
    return_day: ret.day,
    return_time: ret.time,
    from_station: str(r.from_station),
    to_station: str(r.to_station),
    via_station: str(r.via_station),
    return_from: str(r.return_from),
    return_to: str(r.return_to),
    taxi_company: str(r.taxi_company),
    taxi_email: str(r.taxi_email),
    is_pmr: !!r.is_pmr,
    pmr_client: str(r.pmr_client),
    pmr_type: str(r.pmr_type),
    pmr_count: num(r.pmr_count),
    passengers: num(r.passengers) || 1,
    vehicles: num(r.vehicles) || 1,
    passenger_name: str(r.passenger_name),
    relation_number: str(r.relation_number),
    billing: str(r.billing) || "SNCB",
    reason: str(r.reason),
    pmr_reason: str(r.pmr_reason),
    confirmed_time: str(r.confirmed_time),
    district: str(r.district),
    notes: str(r.notes),
  });
}

export type TaxiCompany = {
  id: string;
  name: string;
  emails: string[];
  phones: string[];
  addresses: string[];
  places: string[];
};
function taxiCompany(r: RecordModel): TaxiCompany {
  return {
    id: r.id,
    name: str(r.name),
    emails: parseEmails(strings(r.emails)),
    phones: strings(r.phones),
    addresses: strings(r.addresses),
    places: strings(r.places),
  };
}

export type PmrClient = {
  id: string;
  lastName: string;
  firstName: string;
  phone: string;
  type: string;
};
function pmrClient(r: RecordModel): PmrClient {
  return {
    id: r.id,
    lastName: str(r.last_name),
    firstName: str(r.first_name),
    phone: str(r.phone),
    type: str(r.type),
  };
}

export async function getTaxiOrder(id: string) {
  const pb = await pbForRequest();
  const r = await pb.collection("taxi_orders").getOne(z.string().min(15).max(36).parse(id), {
    expand: `${PEOPLE},taxi_company,pmr_client`,
  });
  const ex = (r.expand ?? {}) as Record<string, RecordModel | undefined>;
  return {
    meta: meta("taxi", r),
    draft: taxiDraftFromRecord(r),
    company: ex.taxi_company ? taxiCompany(ex.taxi_company) : null,
    client: ex.pmr_client ? pmrClient(ex.pmr_client) : null,
    /** Copie figée sur la commande (anciennes commandes sans fiche liée). */
    snapshot: {
      taxiName: str(r.taxi_name),
      taxiPhone: str(r.taxi_phone),
      taxiAddress: str(r.taxi_address),
      pmrLastName: str(r.pmr_last_name),
      pmrFirstName: str(r.pmr_first_name),
      pmrPhone: str(r.pmr_phone),
      pmrFile: str(r.pmr_file),
      author: str(r.author),
    },
  };
}
export type TaxiOrderDetail = Awaited<ReturnType<typeof getTaxiOrder>>;

// ---------------------------------------------------------------------------------------------------
// Liste unifiée (suivi, listes bus et taxi)

export type OrderRow = {
  kind: OrderKind;
  id: string;
  number: number;
  status: Status;
  day: string;
  time: string;
  origin: string;
  destination: string;
  company: string;
  relation: string;
  busCount: number;
  cancelledBuses: number;
  isPmr: boolean;
  author: string;
  authorId: string;
  district: string;
  sentAt: string;
  updated: string;
  reason: string;
  /** Bus du bon (B201) ; vide pour un taxi. */
  buses: { planned?: string; confirmed?: string; cancelled?: boolean }[];
};

function busRow(r: RecordModel): OrderRow {
  const buses = arr(r.buses) as { planned?: string; cancelled?: boolean }[];
  const firstPlanned = buses.find((b) => !b.cancelled && b.planned)?.planned ?? "";
  const ex = (r.expand ?? {}) as Record<string, RecordModel | undefined>;
  return {
    kind: "bus",
    id: r.id,
    number: num(r.number),
    status: isStatus(r.status) ? r.status : "brouillon",
    day: str(r.order_date).slice(0, 10),
    time: firstPlanned || str(r.call_time).slice(0, 5),
    origin: str(r.origin),
    destination: str(r.destination),
    company: str(ex.company?.name),
    relation: str(r.relation),
    busCount: buses.filter((b) => !b.cancelled).length || num(r.bus_count),
    cancelledBuses: buses.filter((b) => b.cancelled).length,
    isPmr: false,
    author: str(ex.created_by?.name),
    authorId: str(r.created_by),
    district: str(r.district),
    sentAt: str(r.sent_at),
    updated: str(r.updated),
    reason: str(r.reason),
    buses,
  };
}

/** Ligne taxi ; sans `pmr:read`, la cause PMR n'est pas transmise (elle partirait au navigateur). */
const taxiRowFor = (canPmr: boolean) => (r: RecordModel) => taxiRow(r, canPmr);

function taxiRow(r: RecordModel, canPmr = false): OrderRow {
  const ex = (r.expand ?? {}) as Record<string, RecordModel | undefined>;
  const at = splitInstant(r.trip_at);
  if (r.time_pending) at.time = "";
  return {
    kind: "taxi",
    id: r.id,
    number: num(r.number),
    status: isStatus(r.status) ? r.status : "brouillon",
    day: at.day,
    time: at.time,
    origin: str(r.from_station),
    destination: str(r.to_station),
    company: str(ex.taxi_company?.name) || str(r.taxi_name),
    relation: str(r.relation_number),
    busCount: num(r.vehicles) || 1,
    cancelledBuses: 0,
    isPmr: !!r.is_pmr,
    author: str(ex.created_by?.name) || str(r.author),
    authorId: str(r.created_by),
    district: str(r.district),
    sentAt: str(r.sent_at),
    updated: str(r.updated),
    reason: r.is_pmr ? (canPmr ? str(r.pmr_reason) : "") : str(r.reason),
    buses: [],
  };
}

export const VIEWS = ["a-confirmer", "aujourdhui", "en-cours", "brouillons", "toutes"] as const;
export type View = (typeof VIEWS)[number];

export const listSchema = z.object({
  kind: z.enum(["bus", "taxi", "all"]).default("all"),
  view: z.enum(VIEWS).default("toutes"),
  q: z.string().trim().max(100).default(""),
  status: z
    .string()
    .optional()
    .transform((s) => (isStatus(s) ? s : undefined)),
  from: z.string().refine(isValidDay).optional().catch(undefined),
  to: z.string().refine(isValidDay).optional().catch(undefined),
  district: z
    .string()
    .optional()
    .transform((d) => (d === "Sud-Ouest" || d === "Sud-Est" || d === "Centre" ? d : undefined)),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type ListInput = z.input<typeof listSchema>;

/** Filtre PocketBase d'une collection pour une vue + des filtres (paramètres liés). */
function buildFilter(
  pb: PocketBase,
  kind: OrderKind,
  p: z.infer<typeof listSchema>,
  userId: string,
  canPmr = false,
): string {
  const parts: string[] = [];
  const dateField = kind === "bus" ? "order_date" : "trip_at";
  const today = brusselsDay();
  const bounds = (from: string, to: string) =>
    kind === "bus"
      ? pb.filter(`${dateField} >= {:a} && ${dateField} < {:b}`, {
          a: dayToPb(from),
          b: dayToPb(addDays(to, 1)),
        })
      : // Taxi : instant réel ; bornes = minuit à Bruxelles (heure d'été comme d'hiver).
        pb.filter(`${dateField} >= {:a} && ${dateField} < {:b}`, {
          a: toPbInstant(brusselsToUtc(from)),
          b: toPbInstant(brusselsToUtc(addDays(to, 1))),
        });
  switch (p.view) {
    case "a-confirmer":
      parts.push('status = "envoye"');
      break;
    case "aujourdhui":
      parts.push('status != "annule" && status != "brouillon"');
      parts.push(bounds(today, today));
      break;
    case "en-cours":
      parts.push('status = "en_cours"');
      break;
    case "brouillons":
      parts.push('status = "brouillon"');
      parts.push(pb.filter("created_by = {:me}", { me: userId }));
      break;
    default:
      break;
  }
  if (p.status) parts.push(pb.filter("status = {:s}", { s: p.status }));
  if (p.from || p.to) parts.push(bounds(p.from ?? "2000-01-01", p.to ?? "2100-01-01"));
  if (p.district) parts.push(pb.filter("district = {:d}", { d: p.district }));
  if (p.q) {
    const fields =
      kind === "bus"
        ? ["origin", "destination", "relation", "reason", "company.name"]
        : [
            "from_station",
            "to_station",
            "relation_number",
            "taxi_name",
            ...(canPmr ? ["pmr_last_name"] : []),
          ];
    const n = Number.parseInt(p.q, 10);
    const ors = fields.map((f) => pb.filter(`${f} ~ {:q}`, { q: p.q }));
    if (String(n) === p.q) ors.push(pb.filter("number = {:n}", { n }));
    parts.push(`(${ors.join(" || ")})`);
  }
  return parts.map((x) => `(${x})`).join(" && ");
}

function sortFor(kind: OrderKind, view: View): string {
  if (view === "a-confirmer") return "sent_at";
  if (view === "brouillons") return "-updated";
  if (view === "aujourdhui" || view === "en-cours")
    return kind === "bus" ? "order_date,call_time" : "trip_at";
  return kind === "bus" ? "-order_date,-number" : "-trip_at,-number";
}

/** Liste des commandes visibles par l'agent (bus et/ou taxi selon ses droits). */
export async function listOrders(
  input: ListInput,
  ctx: { userId: string; canBus: boolean; canTaxi: boolean; canPmr?: boolean },
): Promise<{ rows: OrderRow[]; total: number }> {
  const p = listSchema.parse(input);
  const pb = await pbForRequest();
  const kinds: OrderKind[] = (p.kind === "all" ? (["bus", "taxi"] as const) : [p.kind]).filter(
    (k) => (k === "bus" ? ctx.canBus : ctx.canTaxi),
  );
  const results = await Promise.all(
    kinds.map(async (kind) => {
      const res = await pb.collection(COLLECTION[kind]).getList(1, p.limit, {
        filter: buildFilter(pb, kind, p, ctx.userId, ctx.canPmr),
        sort: sortFor(kind, p.view),
        expand: kind === "bus" ? "company,created_by" : "taxi_company,created_by",
        fields:
          kind === "bus"
            ? "id,number,status,order_date,call_time,origin,destination,relation,bus_count,buses,created_by,district,sent_at,updated,reason,expand.company.name,expand.created_by.name"
            : "id,number,status,trip_at,from_station,to_station,relation_number,taxi_name,vehicles,is_pmr,time_pending,created_by,author,district,sent_at,updated,reason,pmr_reason,expand.taxi_company.name,expand.created_by.name",
      });
      return {
        rows: res.items.map(kind === "bus" ? busRow : taxiRowFor(!!ctx.canPmr)),
        total: res.totalItems,
      };
    }),
  );
  const rows = results.flatMap((r) => r.rows);
  rows.sort(compareRows(p.view));
  return { rows, total: results.reduce((s, r) => s + r.total, 0) };
}

function compareRows(view: View) {
  const key = (r: OrderRow) => `${r.day}T${r.time || "99:99"}`;
  switch (view) {
    case "a-confirmer":
      return (a: OrderRow, b: OrderRow) => a.sentAt.localeCompare(b.sentAt);
    case "brouillons":
      return (a: OrderRow, b: OrderRow) => b.updated.localeCompare(a.updated);
    case "aujourdhui":
    case "en-cours":
      return (a: OrderRow, b: OrderRow) => key(a).localeCompare(key(b));
    default:
      return (a: OrderRow, b: OrderRow) => key(b).localeCompare(key(a)) || b.number - a.number;
  }
}

/** Compteurs des vues enregistrées (onglets du suivi). */
export async function viewCounts(ctx: {
  userId: string;
  canBus: boolean;
  canTaxi: boolean;
}): Promise<Record<View, number>> {
  const entries = await Promise.all(
    VIEWS.filter((v) => v !== "toutes").map(async (view) => {
      const pb = await pbForRequest();
      const p = listSchema.parse({ view });
      let total = 0;
      for (const kind of ["bus", "taxi"] as const) {
        if (kind === "bus" ? !ctx.canBus : !ctx.canTaxi) continue;
        total += (
          await pb.collection(COLLECTION[kind]).getList(1, 1, {
            filter: buildFilter(pb, kind, p, ctx.userId),
            fields: "id",
          })
        ).totalItems;
      }
      return [view, total] as const;
    }),
  );
  return { ...Object.fromEntries(entries), toutes: 0 } as Record<View, number>;
}

// ---------------------------------------------------------------------------------------------------
// Historique

export type OrderEvent = {
  id: string;
  from: string;
  to: Status;
  at: string;
  by: string;
  note: string;
  legacy: boolean;
};

export async function listEvents(kind: OrderKind, id: string): Promise<OrderEvent[]> {
  const pb = await pbForRequest();
  const items = await pb.collection("order_events").getFullList({
    filter: pb.filter("kind = {:kind} && order = {:id}", { kind, id }),
    sort: "at",
    expand: "by",
  });
  return items.map((e) => ({
    id: e.id,
    from: str(e.from),
    to: isStatus(e.to) ? e.to : "brouillon",
    at: str(e.at),
    by: person(e, "by")?.name ?? (e.legacy ? "BACO" : "Système"),
    note: str(e.note),
    legacy: !!e.legacy,
  }));
}

// ---------------------------------------------------------------------------------------------------
// Référentiels

export type BusCompany = { id: string; name: string; email: string; phone: string };
export type Driver = { id: string; company: string; name: string; phone: string };
export type LineInfo = { line: string; stations: string[] };

export const busReference = cache(async () => {
  const pb = await pbForRequest();
  const [companies, drivers, stations, companyLines] = await Promise.all([
    pb.collection("bus_companies").getFullList({ sort: "name", fields: "id,name,email,phone" }),
    pb.collection("bus_drivers").getFullList({ sort: "name", fields: "id,company,name,phone" }),
    pb
      .collection("line_stations")
      .getFullList({ sort: "line,position", fields: "line,station,position" }),
    pb.collection("bus_company_lines").getFullList({ fields: "company,line" }),
  ]);
  const lines = new Map<string, string[]>();
  for (const s of stations) {
    const list = lines.get(str(s.line)) ?? [];
    list.push(str(s.station));
    lines.set(str(s.line), list);
  }
  const lineList: LineInfo[] = [...lines.entries()]
    .map(([line, st]) => ({ line, stations: st }))
    .sort((a, b) => a.line.localeCompare(b.line, "fr", { numeric: true }));
  return {
    companies: companies.map((c) => ({
      id: c.id,
      name: str(c.name),
      email: parseEmails(str(c.email)).join("; "),
      phone: str(c.phone),
    })) satisfies BusCompany[],
    drivers: drivers.map((d) => ({
      id: d.id,
      company: str(d.company),
      name: str(d.name),
      phone: str(d.phone),
    })) satisfies Driver[],
    lines: lineList,
    stations: [...new Set(stations.map((s) => str(s.station)))].sort((a, b) =>
      a.localeCompare(b, "fr"),
    ),
    companyLines: companyLines.map((l) => ({ company: str(l.company), line: str(l.line) })),
  };
});
export type BusReference = Awaited<ReturnType<typeof busReference>>;

export const taxiReference = cache(async () => {
  const pb = await pbForRequest();
  const [companies, stations] = await Promise.all([
    pb.collection("taxi_companies").getFullList({ sort: "name" }),
    pb.collection("line_stations").getFullList({ fields: "station" }),
  ]);
  return {
    companies: companies.map(taxiCompany),
    stations: [...new Set(stations.map((s) => str(s.station)))].sort((a, b) =>
      a.localeCompare(b, "fr"),
    ),
  };
});
export type TaxiReference = Awaited<ReturnType<typeof taxiReference>>;

export async function searchPmrClients(q: string): Promise<PmrClient[]> {
  const query = z.string().trim().min(2).max(60).parse(q);
  const pb = await pbForRequest();
  const res = await pb.collection("pmr_clients").getList(1, 12, {
    // Fiches archivées exclues (une fiche archivée se réactive depuis le module PMR).
    filter: pb.filter(
      "archived = false && (last_name ~ {:q} || first_name ~ {:q} || phone ~ {:q})",
      {
        q: query,
      },
    ),
    sort: "last_name,first_name",
  });
  return res.items.map(pmrClient);
}

export async function getPmrClient(id: string): Promise<PmrClient | null> {
  if (!id) return null;
  const pb = await pbForRequest();
  try {
    return pmrClient(await pb.collection("pmr_clients").getOne(id));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------
// Modèles (tous partagés) et raccourcis « refaire »

export type Template = { id: string; name: string; author: string; updated: string };

export async function listTemplates(kind: OrderKind): Promise<Template[]> {
  const pb = await pbForRequest();
  const items = await pb.collection("order_templates").getFullList({
    filter: pb.filter("kind = {:kind}", { kind }),
    sort: "name",
    expand: "created_by",
    fields: "id,name,updated,expand.created_by.name",
  });
  return items.map((t) => ({
    id: t.id,
    name: str(t.name),
    author: person(t, "created_by")?.name ?? "",
    updated: str(t.updated),
  }));
}

export async function getTemplateData(kind: OrderKind, id: string): Promise<unknown> {
  const pb = await pbForRequest();
  const t = await pb.collection("order_templates").getOne(z.string().min(15).max(36).parse(id));
  if (t.kind !== kind) throw new Error("Modèle d'un autre type");
  return t.data;
}

/** Dernières commandes de l'agent (« Refaire la commande d'hier »). */
export async function recentOwnOrders(kind: OrderKind, userId: string, limit = 3, canPmr = false) {
  const pb = await pbForRequest();
  const res = await pb.collection(COLLECTION[kind]).getList(1, limit, {
    filter: pb.filter('created_by = {:me} && status != "brouillon"', { me: userId }),
    sort: "-created",
    expand: kind === "bus" ? "company,created_by" : "taxi_company,created_by",
  });
  return res.items.map(kind === "bus" ? busRow : taxiRowFor(canPmr));
}

/**
 * Agent sans `pmr:read` : les données PMR copiées sur la commande taxi (nom, téléphone, type, cause) ne sont
 * ni affichées ni mises dans le PDF / l'e-mail (la règle PocketBase ne porte que sur `generate_taxi:read`).
 */
export function redactPmr<T extends TaxiOrderDetail>(o: T): T {
  return {
    ...o,
    client: null,
    draft: { ...o.draft, pmr_client: "", pmr_type: "", pmr_reason: "", passenger_name: "" },
    snapshot: { ...o.snapshot, pmrLastName: "", pmrFirstName: "", pmrPhone: "", pmrFile: "" },
  };
}
