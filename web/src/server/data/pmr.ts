import "server-only";

import type { RecordModel } from "pocketbase";
import { z } from "zod";

import { ASSIST_STATUSES, type AssistStatus, type EquipmentState } from "@/lib/pmr/model";
import { addDays, brusselsDay, isValidDay } from "@/lib/orders/time";

import { pbForRequest } from "./orders";

// Accès aux données PMR, avec le jeton de l'agent (règles PocketBase). Le nom d'un client n'est développé que si
// l'agent a `pmr:read` (sinon la règle de `pmr_clients` vide l'expand) : on ne l'affiche jamais sans ce droit.

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : 0);
const exp = (r: RecordModel) => (r.expand ?? {}) as Record<string, RecordModel | undefined>;

export type Zone = {
  id: string;
  code: string;
  label: string;
  district: string;
  stations: string[];
};

export async function listZones(): Promise<Zone[]> {
  const pb = await pbForRequest();
  const items = await pb.collection("pmr_zones").getFullList({ sort: "code" });
  return items.map((z) => ({
    id: z.id,
    code: str(z.code),
    label: str(z.label),
    district: str(z.district),
    stations: Array.isArray(z.stations) ? (z.stations as string[]) : [],
  }));
}

// ---------------------------------------------------------------------------------------------------
// Prestations

export type Assist = {
  id: string;
  day: string;
  time: string;
  period: string;
  direction: string;
  train: string;
  station: string;
  zone: string;
  zoneCode: string;
  dicosRef: string;
  pax: number;
  pmrType: string;
  clientId: string;
  /** Vide sans `pmr:read`. */
  clientName: string;
  clientPhone: string;
  note: string;
  status: AssistStatus;
  cancelReason: string;
  author: string;
  legacy: boolean;
  /** Texte d'origine de BACO (peut contenir un nom) : seulement avec `pmr:read`. */
  legacyText: string;
  anonymized: boolean;
  updated: string;
};

function assist(r: RecordModel, canPmr: boolean): Assist {
  const e = exp(r);
  const client = canPmr ? e.client : undefined;
  return {
    id: r.id,
    day: str(r.day),
    time: str(r.time),
    period: str(r.period),
    direction: str(r.direction),
    train: str(r.train),
    station: str(r.station),
    zone: str(r.zone),
    zoneCode: str(e.zone?.code),
    dicosRef: str(r.dicos_ref),
    pax: num(r.pax) || 1,
    pmrType: str(r.pmr_type),
    clientId: str(r.client),
    clientName: client ? `${str(client.last_name)} ${str(client.first_name)}`.trim() : "",
    clientPhone: client ? str(client.phone) : "",
    note: str(r.note),
    status: (ASSIST_STATUSES as readonly string[]).includes(str(r.status))
      ? (str(r.status) as AssistStatus)
      : "prevue",
    cancelReason: str(r.cancel_reason),
    author: str(e.created_by?.name),
    legacy: !!str(r.legacy_id),
    legacyText: canPmr ? str(r.legacy_text) : "",
    anonymized: !!r.anonymized,
    updated: str(r.updated),
  };
}

export const assistListSchema = z.object({
  from: z.string().refine(isValidDay).optional().catch(undefined),
  to: z.string().refine(isValidDay).optional().catch(undefined),
  zone: z
    .string()
    .regex(/^[a-z0-9]{15}$/)
    .optional()
    .catch(undefined),
  q: z.string().trim().max(60).default(""),
  status: z
    .string()
    .optional()
    .transform((v) => ASSIST_STATUSES.find((x) => x === v)),
  limit: z.coerce.number().int().min(1).max(1000).default(300),
});

export async function listAssists(
  input: z.input<typeof assistListSchema>,
  ctx: { canPmr: boolean; order?: "asc" | "desc" },
) {
  const p = assistListSchema.parse(input);
  const pb = await pbForRequest();
  const today = brusselsDay();
  const parts = [
    pb.filter("day >= {:a} && day <= {:b}", { a: p.from ?? today, b: p.to ?? p.from ?? today }),
  ];
  if (p.zone) parts.push(pb.filter("zone = {:z}", { z: p.zone }));
  if (p.status) parts.push(pb.filter("status = {:s}", { s: p.status }));
  if (p.q) {
    const ors = ["station ~ {:q}", "train ~ {:q}", "dicos_ref ~ {:q}"];
    if (ctx.canPmr) ors.push("client.last_name ~ {:q}");
    parts.push(pb.filter(`(${ors.join(" || ")})`, { q: p.q }));
  }
  const res = await pb.collection("pmr_assists").getList(1, p.limit, {
    filter: parts.join(" && "),
    sort: ctx.order === "desc" ? "-day,-time" : "day,time",
    expand: ctx.canPmr ? "zone,client,created_by" : "zone,created_by",
  });
  return { rows: res.items.map((r) => assist(r, ctx.canPmr)), total: res.totalItems };
}

export async function getAssist(id: string, canPmr: boolean) {
  const pb = await pbForRequest();
  const r = await pb.collection("pmr_assists").getOne(
    z
      .string()
      .regex(/^[a-z0-9]{15}$/)
      .parse(id),
    {
      expand: canPmr ? "zone,client,created_by" : "zone,created_by",
    },
  );
  return assist(r, canPmr);
}

export type PmrEvent = {
  id: string;
  field: string;
  from: string;
  to: string;
  by: string;
  note: string;
  at: string;
};

export async function listPmrEvents(kind: "assist" | "equipment", id: string): Promise<PmrEvent[]> {
  const pb = await pbForRequest();
  const items = await pb.collection("pmr_events").getFullList({
    filter: pb.filter("kind = {:k} && record = {:id}", { k: kind, id }),
    sort: "at",
    expand: "by",
  });
  return items.map((e) => ({
    id: e.id,
    field: str(e.field),
    from: str(e.from),
    to: str(e.to),
    by: str(exp(e).by?.name) || "Import BACO",
    note: str(e.note),
    at: str(e.at),
  }));
}

// ---------------------------------------------------------------------------------------------------
// Clients

export type ClientRow = {
  id: string;
  lastName: string;
  firstName: string;
  phone: string;
  type: string;
  typeDetail: string;
  notes: string;
  archived: boolean;
  updated: string;
};

function client(r: RecordModel): ClientRow {
  return {
    id: r.id,
    lastName: str(r.last_name),
    firstName: str(r.first_name),
    phone: str(r.phone),
    type: str(r.type),
    typeDetail: str(r.type_detail),
    notes: str(r.notes),
    archived: !!r.archived,
    updated: str(r.updated),
  };
}

export async function listClients(input: { q?: string; page?: number; archived?: boolean }) {
  const q = z
    .string()
    .trim()
    .max(60)
    .default("")
    .parse(input.q ?? "");
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .default(1)
    .parse(input.page ?? 1);
  const pb = await pbForRequest();
  const parts = [input.archived ? "archived = true" : "archived = false"];
  if (q)
    parts.push(
      pb.filter("(last_name ~ {:q} || first_name ~ {:q} || phone ~ {:q} || notes ~ {:q})", { q }),
    );
  const res = await pb
    .collection("pmr_clients")
    .getList(page, 30, { filter: parts.join(" && "), sort: "last_name,first_name" });
  return {
    rows: res.items.map(client),
    total: res.totalItems,
    page: res.page,
    totalPages: res.totalPages,
  };
}

export async function getClientDetail(id: string, opts: { canAssists: boolean; canTaxi: boolean }) {
  const pb = await pbForRequest();
  const cid = z
    .string()
    .regex(/^[a-z0-9]{15}$/)
    .parse(id);
  const r = await pb.collection("pmr_clients").getOne(cid);
  const [assists, taxis] = await Promise.all([
    opts.canAssists
      ? pb.collection("pmr_assists").getList(1, 10, {
          filter: pb.filter("client = {:c}", { c: cid }),
          sort: "-day,-time",
          expand: "zone",
        })
      : null,
    opts.canTaxi
      ? pb.collection("taxi_orders").getList(1, 10, {
          filter: pb.filter("pmr_client = {:c}", { c: cid }),
          sort: "-trip_at",
          fields: "id,number,status,trip_at,from_station,to_station",
        })
      : null,
  ]);
  return {
    client: client(r),
    assists: assists ? assists.items.map((a) => assist(a, true)) : [],
    assistCount: assists?.totalItems ?? 0,
    taxis: (taxis?.items ?? []).map((t) => ({
      id: t.id,
      number: num(t.number),
      status: str(t.status),
      tripAt: str(t.trip_at),
      route: `${str(t.from_station) || "?"} → ${str(t.to_station) || "?"}`,
    })),
  };
}
export type ClientDetail = Awaited<ReturnType<typeof getClientDetail>>;

// ---------------------------------------------------------------------------------------------------
// Matériel

export type Equipment = {
  id: string;
  station: string;
  platform: string;
  zone: string;
  zoneCode: string;
  assistance: string;
  rampType: string;
  rampId: string;
  state: EquipmentState;
  stateNote: string;
  repairRequested: boolean;
  padlock: string;
  validUntil: string;
  rampNote: string;
  stationRestrictions: string;
  stationInfo: string;
  updated: string;
};

function equipment(r: RecordModel): Equipment {
  return {
    id: r.id,
    station: str(r.station),
    platform: str(r.platform),
    zone: str(r.zone),
    zoneCode: str(exp(r).zone?.code),
    assistance: str(r.assistance),
    rampType: str(r.ramp_type),
    rampId: str(r.ramp_id),
    state: (["ok", "hs", "en_attente"].includes(str(r.state))
      ? str(r.state)
      : "ok") as EquipmentState,
    stateNote: str(r.state_note),
    repairRequested: !!r.repair_requested,
    padlock: str(r.padlock),
    validUntil: str(r.valid_until),
    rampNote: str(r.ramp_note),
    stationRestrictions: str(r.station_restrictions),
    stationInfo: str(r.station_info),
    updated: str(r.updated),
  };
}

export const EQUIPMENT_VIEWS = ["hors-service", "reparation", "validite", "toutes"] as const;
export type EquipmentView = (typeof EQUIPMENT_VIEWS)[number];

function equipmentFilter(view: EquipmentView, today: string): string {
  switch (view) {
    case "hors-service":
      return 'state != "ok"';
    case "reparation":
      return "repair_requested = true";
    case "validite":
      return `valid_until != "" && valid_until < "${today}"`;
    default:
      return "";
  }
}

export async function listEquipment(input: { view?: string; q?: string; zone?: string }) {
  const view = EQUIPMENT_VIEWS.find((v) => v === input.view) ?? "toutes";
  const q = z
    .string()
    .trim()
    .max(60)
    .default("")
    .parse(input.q ?? "");
  const zone = z
    .string()
    .regex(/^[a-z0-9]{15}$/)
    .optional()
    .catch(undefined)
    .parse(input.zone);
  const pb = await pbForRequest();
  const today = brusselsDay();
  const parts = [equipmentFilter(view, today)].filter(Boolean);
  if (q) parts.push(pb.filter("(station ~ {:q} || platform ~ {:q} || ramp_id ~ {:q})", { q }));
  if (zone) parts.push(pb.filter("zone = {:z}", { z: zone }));
  const [items, counts] = await Promise.all([
    pb
      .collection("pmr_equipment")
      .getFullList({ filter: parts.join(" && "), sort: "station,platform", expand: "zone" }),
    Promise.all(
      EQUIPMENT_VIEWS.map(async (v) => {
        const f = equipmentFilter(v, today);
        return [
          v,
          (await pb.collection("pmr_equipment").getList(1, 1, { filter: f, fields: "id" }))
            .totalItems,
        ] as const;
      }),
    ),
  ]);
  return {
    view,
    rows: items.map(equipment),
    counts: Object.fromEntries(counts) as Record<EquipmentView, number>,
  };
}

/** Plage par défaut de l'historique : 30 derniers jours jusqu'à hier. */
export function historyRange(today = brusselsDay()) {
  return { from: addDays(today, -30), to: addDays(today, -1) };
}
