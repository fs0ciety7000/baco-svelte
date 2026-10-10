import "server-only";

import type { RecordModel } from "pocketbase";
import { z } from "zod";

import { ASSIST_STATUSES, type AssistStatus, type EquipmentState } from "@/lib/pmr/model";
import { addDays, brusselsDay, isValidDay } from "@/lib/orders/time";
import type { TrainState, TrainStates } from "@/lib/pmr/train-delay";
import { syncSummary, type SyncRow } from "@/lib/pmr/sync-state";

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

/** Détail nominatif d'une mission DICOS (collection `pmr_mission`) : seulement avec `pmr:read`. */
export type MissionDetail = {
  reservationType: string;
  clientEmail: string;
  clientLang: string;
  clientDesc: string;
  trainManagerName: string;
  trainManagerPhone: string;
  driverName: string;
  driverPhone: string;
  meetingPoint: string;
  coach: string;
  door: string;
  ownerName: string;
};

export type Assist = {
  id: string;
  day: string;
  time: string;
  period: string;
  direction: string;
  train: string;
  station: string;
  otherStation: string;
  district: string;
  /** Heure d'arrivée et district de la gare d'arrivée (trajet DICOS v3). */
  arrTime: string;
  arrDistrict: string;
  /** Assistance à l'embarquement (gare de départ) / au débarquement (gare d'arrivée). */
  inAssist: boolean;
  outAssist: boolean;
  transport: string;
  zone: string;
  zoneCode: string;
  dicosRef: string;
  pax: number;
  pmrType: string;
  /** Voyageurs en assistance complète / légère (DICOS ; 0 et 0 = inconnu) — logigramme ALEA. */
  fullPax: number;
  lightPax: number;
  clientId: string;
  /** Vide sans `pmr:read` (nom du voyageur : DICOS → `pmr_mission`, repris de BACO → `pmr_clients`). */
  clientName: string;
  clientPhone: string;
  /** Détail nominatif DICOS, seulement avec `pmr:read`. */
  mission?: MissionDetail;
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
  // Back-relation pmr_mission (détail nominatif DICOS) : tableau, on prend la première.
  // Back-relation : PocketBase renvoie un OBJET (et non une liste) quand `pmr_mission.assist` a un index unique —
  // c'est le cas ; on accepte les deux formes (sinon nom, téléphone et e-mail du client n'apparaissaient jamais).
  const via = canPmr
    ? (r.expand as Record<string, RecordModel | RecordModel[] | undefined> | undefined)?.[
        "pmr_mission_via_assist"
      ]
    : undefined;
  const m = Array.isArray(via) ? via[0] : via;
  const nameFromMission = m ? `${str(m.client_last)} ${str(m.client_first)}`.trim() : "";
  const nameFromClient = client ? `${str(client.last_name)} ${str(client.first_name)}`.trim() : "";
  return {
    id: r.id,
    day: str(r.day),
    time: str(r.time),
    period: str(r.period),
    direction: str(r.direction),
    train: str(r.train),
    station: str(r.station),
    otherStation: str(r.other_station),
    district: str(r.district),
    arrTime: str(r.arr_time),
    arrDistrict: str(r.arr_district),
    inAssist: !!r.in_assist,
    outAssist: !!r.out_assist,
    transport: str(r.transport),
    zone: str(r.zone),
    zoneCode: str(e.zone?.code),
    dicosRef: str(r.dicos_ref),
    pax: num(r.pax) || 1,
    fullPax: num(r.full_pax),
    lightPax: num(r.light_pax),
    pmrType: str(r.pmr_type),
    clientId: str(r.client),
    clientName: nameFromMission || nameFromClient,
    clientPhone: m ? str(m.client_phone) : client ? str(client.phone) : "",
    mission: m
      ? {
          reservationType: str(m.reservation_type),
          clientEmail: str(m.client_email),
          clientLang: str(m.client_lang),
          clientDesc: str(m.client_desc),
          trainManagerName: str(m.train_manager_name),
          trainManagerPhone: str(m.train_manager_phone),
          driverName: str(m.driver_name),
          driverPhone: str(m.driver_phone),
          meetingPoint: str(m.meeting_point),
          coach: str(m.coach),
          door: str(m.door),
          ownerName: str(m.owner_name),
        }
      : undefined,
    note: str(r.note),
    status: (ASSIST_STATUSES as readonly string[]).includes(str(r.status))
      ? (str(r.status) as AssistStatus)
      : "prevue",
    cancelReason: str(r.cancel_reason),
    author: str(e.created_by?.name),
    legacy: !!str(r.legacy_id),
    legacyText: "",
    anonymized: !!r.anonymized,
    updated: str(r.updated),
  };
}

export const assistListSchema = z.object({
  from: z.string().refine(isValidDay).optional().catch(undefined),
  to: z.string().refine(isValidDay).optional().catch(undefined),
  district: z
    .string()
    .optional()
    .transform((v) => (["DCE", "DSE", "DSO"] as const).find((x) => x === v)),
  q: z.string().trim().max(60).default(""),
  hideCancelled: z.boolean().default(false),
  status: z
    .string()
    .optional()
    .transform((v) => ASSIST_STATUSES.find((x) => x === v)),
  limit: z.coerce.number().int().min(1).max(5000).default(300),
});

export async function listAssists(
  input: z.input<typeof assistListSchema>,
  ctx: { canPmr: boolean; order?: "asc" | "desc"; all?: boolean },
) {
  const p = assistListSchema.parse(input);
  const pb = await pbForRequest();
  const today = brusselsDay();
  const parts = [
    pb.filter("day >= {:a} && day <= {:b}", { a: p.from ?? today, b: p.to ?? p.from ?? today }),
  ];
  // Un trajet concerne un district si sa gare de départ OU d'arrivée y est.
  if (p.district)
    parts.push(pb.filter("(district = {:d} || arr_district = {:d})", { d: p.district }));
  if (p.status) parts.push(pb.filter("status = {:s}", { s: p.status }));
  // « Masquer les annulées » (sans effet si un statut précis est demandé).
  else if (p.hideCancelled) parts.push('status != "annulee"');
  if (p.q) {
    const ors = ["station ~ {:q}", "other_station ~ {:q}", "train ~ {:q}", "dicos_ref ~ {:q}"];
    // Nom du voyageur : BACO (client lié) et DICOS (détail nominatif), avec `pmr:read` seulement.
    if (ctx.canPmr)
      ors.push("client.last_name ~ {:q}", "pmr_mission_via_assist.client_last ~ {:q}");
    parts.push(pb.filter(`(${ors.join(" || ")})`, { q: p.q }));
  }
  const options = {
    filter: parts.join(" && "),
    sort: ctx.order === "desc" ? "-day,-time" : "day,time",
    expand: ctx.canPmr ? "zone,client,created_by,pmr_mission_via_assist" : "zone,created_by",
  };
  // Export : toutes les lignes (PocketBase plafonne une page à 1000).
  if (ctx.all) {
    const items = await pb.collection("pmr_assists").getFullList({ ...options, batch: 1000 });
    return { rows: items.map((r) => assist(r, ctx.canPmr)), total: items.length };
  }
  const res = await pb.collection("pmr_assists").getList(1, p.limit, options);
  return { rows: res.items.map((r) => assist(r, ctx.canPmr)), total: res.totalItems };
}

export async function getAssist(id: string, canPmr: boolean) {
  const pb = await pbForRequest();
  const aid = z
    .string()
    .regex(/^[a-z0-9]{15}$/)
    .parse(id);
  const r = await pb.collection("pmr_assists").getOne(aid, {
    expand: canPmr ? "zone,client,created_by,pmr_mission_via_assist" : "zone,created_by",
  });
  const a = assist(r, canPmr);
  // Texte d'origine de BACO : collection à part, lisible avec pmr:read seulement (règle PocketBase).
  if (canPmr && a.legacy) {
    const lg = await pb
      .collection("pmr_assist_legacy")
      .getFirstListItem(pb.filter("assist = {:a}", { a: aid }))
      .catch(() => null);
    a.legacyText = str(lg?.text);
  }
  return a;
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

export function equipment(r: RecordModel): Equipment {
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

export type DicosSync = {
  /** Fraîcheur de la période : dernière synchro complète du jour le moins récent ; sinon dernière synchro reçue. */
  lastAt: string | null;
  /** Chaque jour de la période a reçu une synchro COMPLÈTE (14 jours au plus examinés). */
  covered: boolean;
  /** Jours de la période sans synchro complète. */
  missing: string[];
  /** Dernier envoi de la période sans son dernier lot (synchro en cours ou interrompue), ISO, ou null. */
  partialAt: string | null;
  /** Agent dont l'extension a fait le dernier envoi de la période (jeton personnel), ou null. */
  by: string | null;
};

/**
 * État des synchros DICOS (audit UX du 9 oct. 2026 : rien n'indiquait la fraîcheur des missions). `null` si la
 * collection n'est pas lisible (droits) : l'écran n'affiche alors rien.
 */
export async function dicosSyncState(
  kind: "missions" | "groups",
  from: string,
  to: string,
): Promise<DicosSync | null> {
  const pb = await pbForRequest();
  try {
    // Groupes : l'extension n'envoie rien les jours sans groupe ; une synchro des missions du même jour vaut donc
    // aussi pour les groupes (revue du 9 oct. 2026 : « pas encore synchronisé » affiché en permanence).
    const kindFilter =
      kind === "groups"
        ? '(kind = "groups" || kind = "missions")'
        : pb.filter("kind = {:k}", { k: kind });
    const range = `${kindFilter} && ${pb.filter("day >= {:a} && day <= {:b}", { a: from, b: to })}`;
    const [last, inRange] = await Promise.all([
      pb
        .collection("dicos_syncs")
        .getList(1, 1, { filter: kindFilter, sort: "-created", fields: "created" }),
      pb.collection("dicos_syncs").getList(1, 200, {
        filter: range,
        sort: "-created",
        expand: "synced_by",
        fields: "day,kind,created,complete,expand.synced_by.name",
        skipTotal: true,
      }),
    ]);
    type Row = SyncRow & { expand?: { synced_by?: { name?: string } } };
    const rows = inRange.items as unknown as Row[];
    const sum = syncSummary(rows, from, to, kind);
    return {
      // Fraîcheur de la période affichée (jour le moins récemment synchronisé) ; à défaut, la dernière synchro reçue.
      lastAt: sum.freshness ?? (last.items[0]?.created as string | undefined) ?? null,
      covered: sum.missing.length === 0,
      missing: sum.missing,
      partialAt: sum.partialAt,
      by: rows[0]?.expand?.synced_by?.name || null,
    };
  } catch {
    return null;
  }
}

/**
 * États iRail des trains de mission (`mission_trains`, cron PocketBase) sur une période, par « jour|train ». Les trains
 * ne sont suivis que le jour même : une période passée ou future renvoie peu ou rien. Collection absente : vide.
 */
export async function listTrainStates(from: string, to: string): Promise<TrainStates> {
  if (!isValidDay(from) || !isValidDay(to)) return {};
  const pb = await pbForRequest();
  try {
    const rows = await pb.collection("mission_trains").getFullList({
      filter: pb.filter("day >= {:from} && day <= {:to}", { from, to }),
      fields: "day,train,delay,cancelled,stops,checked_at",
      batch: 500,
    });
    const out: TrainStates = {};
    for (const r of rows) {
      const stops = (Array.isArray(r.stops) ? r.stops : []) as TrainState["stops"];
      out[`${r.day}|${r.train}`] = {
        delay: typeof r.delay === "number" ? r.delay : 0,
        cancelled: r.cancelled === true,
        stops,
        checkedAt: typeof r.checked_at === "string" ? r.checked_at : "",
      };
    }
    return out;
  } catch {
    return {};
  }
}
