"use server";

import { ClientResponseError } from "pocketbase";
import { z } from "zod";

import { can } from "@/lib/permissions";
import {
  busDraftSchema,
  checkBusForSend,
  checkTaxiForSend,
  emptyBus,
  parseEmails,
  taxiDraftSchema,
  type BusDraft,
  type TaxiDraft,
} from "@/lib/orders/schemas";
import { isStatus, type OrderKind } from "@/lib/orders/status";
import { brusselsDay, brusselsToUtc, brusselsTime, formatShortDay } from "@/lib/orders/time";
import { requireUser, type SessionUser } from "@/server/auth";
import { manualEntrySchema, notesSchema } from "@/server/data/b201";
import {
  busDraftFromRecord,
  busDraftToRecord,
  busReference,
  COLLECTION,
  getBusOrder,
  getTaxiOrder,
  listEvents,
  pbForRequest,
  searchPmrClients,
  taxiDraftFromRecord,
  type OrderEvent,
  type PmrClient,
} from "@/server/data/orders";

// Écritures du module Commandes : Server Actions validées par zod, exécutées avec le jeton de l'agent.
// Les règles et hooks PocketBase revérifient tout (droits, transitions, horodatages).

export type ActionResult<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

const idSchema = z.string().regex(/^[a-z0-9-]{15,36}$/);
const kindSchema = z.enum(["bus", "taxi"]);

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof ClientResponseError) {
    const data = e.response?.data as Record<string, { message?: string }> | undefined;
    const field = data ? Object.entries(data)[0] : undefined;
    const msg = field ? `${field[0]} : ${field[1]?.message ?? "invalide"}` : e.response?.message;
    if (e.status === 404) return { ok: false, error: "Commande introuvable ou accès refusé." };
    if (e.status === 403) return { ok: false, error: msg || "Action non autorisée." };
    return { ok: false, error: msg || "Enregistrement refusé." };
  }
  if (e instanceof ConflictError)
    return { ok: false, error: "CONFLIT : la commande a été modifiée par ailleurs. Rechargez-la." };
  if (e instanceof z.ZodError)
    return { ok: false, error: e.issues[0]?.message ?? "Saisie invalide." };
  return { ok: false, error: "Erreur inattendue, réessayez." };
}

async function writer(kind: OrderKind): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, kind === "bus" ? "otto:write" : "generate_taxi:write")) {
    throw new z.ZodError([
      { code: "custom", message: "Droit d'écriture manquant.", path: [], input: null },
    ]);
  }
  return user;
}

/** Verrou optimiste : refuse d'écraser une commande modifiée ailleurs (confirmation depuis le suivi…). */
async function assertUnchanged(
  pb: Awaited<ReturnType<typeof pbForRequest>>,
  collection: string,
  id: string,
  expectedUpdated?: string,
) {
  if (!expectedUpdated) return;
  const current = await pb.collection(collection).getOne(id, { fields: "updated" });
  if (current.updated !== expectedUpdated) throw new ConflictError();
}

class ConflictError extends Error {}

function userDistrict(user: SessionUser): string {
  return ["Sud-Ouest", "Sud-Est", "Centre"].includes(user.district) ? user.district : "";
}

// ---------------------------------------------------------------------------------------------------
// Enregistrement (automatique) des brouillons

export async function saveBusOrder(
  id: string | null,
  input: unknown,
  expectedUpdated?: string,
): Promise<ActionResult<{ id: string; number: number; updated: string }>> {
  try {
    const user = await writer("bus");
    const draft = busDraftSchema.parse(input);
    const pb = await pbForRequest();
    const body = busDraftToRecord({
      ...draft,
      district: draft.district || (userDistrict(user) as BusDraft["district"]),
    });
    if (id) await assertUnchanged(pb, "bus_orders", idSchema.parse(id), expectedUpdated);
    const r = id
      ? await pb.collection("bus_orders").update(idSchema.parse(id), body)
      : await pb
          .collection("bus_orders")
          .create({ ...body, status: "brouillon", created_by: user.id });
    return {
      ok: true,
      data: { id: r.id, number: r.number as number, updated: r.updated as string },
    };
  } catch (e) {
    return fail(e);
  }
}

/** Champs taxi : instants en UTC, copie figée de la société et du client PMR (bon lisible dans le temps). */
async function taxiBody(draft: TaxiDraft, user: SessionUser) {
  const pb = await pbForRequest();
  const body: Record<string, unknown> = {
    from_station: draft.from_station,
    to_station: draft.to_station,
    via_station: draft.via_station,
    return_from: draft.round_trip ? draft.return_from : "",
    return_to: draft.round_trip ? draft.return_to : "",
    trip_at: draft.trip_day ? brusselsToUtc(draft.trip_day, draft.trip_time || "00:00") : "",
    return_at:
      draft.round_trip && draft.return_day
        ? brusselsToUtc(draft.return_day, draft.return_time || "00:00")
        : "",
    trip_type: draft.round_trip ? "aller-retour" : "aller",
    taxi_company: draft.taxi_company || null,
    taxi_email: draft.taxi_email,
    is_pmr: draft.is_pmr,
    pmr_client: draft.is_pmr && draft.pmr_client ? draft.pmr_client : null,
    pmr_type: draft.is_pmr ? draft.pmr_type : "",
    pmr_count: draft.is_pmr ? draft.pmr_count : 0,
    pmr_reason: draft.is_pmr ? draft.pmr_reason : "",
    passengers: draft.passengers,
    vehicles: draft.vehicles,
    passenger_name: draft.passenger_name,
    relation_number: draft.relation_number,
    billing: draft.billing,
    reason: draft.reason,
    confirmed_time: draft.confirmed_time,
    district: draft.district || userDistrict(user) || null,
    notes: draft.notes,
    author: user.name || user.username,
  };
  if (draft.taxi_company) {
    const c = await pb.collection("taxi_companies").getOne(idSchema.parse(draft.taxi_company));
    body.taxi_name = c.name;
    body.taxi_phone = (Array.isArray(c.phones) ? c.phones : []).join(" / ");
    body.taxi_address = (Array.isArray(c.addresses) ? c.addresses : []).join(" / ");
  }
  if (draft.is_pmr && draft.pmr_client) {
    const c = await pb.collection("pmr_clients").getOne(idSchema.parse(draft.pmr_client));
    body.pmr_last_name = c.last_name;
    body.pmr_first_name = c.first_name;
    body.pmr_phone = c.phone;
    if (!draft.pmr_type) body.pmr_type = c.type;
  }
  return body;
}

export async function saveTaxiOrder(
  id: string | null,
  input: unknown,
  expectedUpdated?: string,
): Promise<ActionResult<{ id: string; number: number; updated: string }>> {
  try {
    const user = await writer("taxi");
    const draft = taxiDraftSchema.parse(input);
    const pb = await pbForRequest();
    const body = await taxiBody(draft, user);
    if (id) await assertUnchanged(pb, "taxi_orders", idSchema.parse(id), expectedUpdated);
    const r = id
      ? await pb.collection("taxi_orders").update(idSchema.parse(id), body)
      : await pb
          .collection("taxi_orders")
          .create({ ...body, status: "brouillon", created_by: user.id });
    return {
      ok: true,
      data: { id: r.id, number: r.number as number, updated: r.updated as string },
    };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------------------------------
// Transitions de statut

const confirmSchema = z
  .object({
    buses: z
      .array(
        z.object({
          index: z.number().int().min(0).max(49),
          confirmed: z.string().regex(/^$|^\d{2}:\d{2}$/),
          plate: z.string().trim().max(40),
          driver: z.string().regex(/^$|^[a-z0-9-]{15,36}$/),
        }),
      )
      .max(50)
      .optional(),
    demob: z
      .array(
        z.object({
          index: z.number().int().min(0).max(49),
          demob: z.string().regex(/^$|^\d{2}:\d{2}$/),
        }),
      )
      .max(50)
      .optional(),
    confirmed_time: z
      .string()
      .regex(/^$|^\d{2}:\d{2}$/)
      .optional(),
  })
  .optional();

const transitionSchema = z.object({
  kind: kindSchema,
  id: idSchema,
  to: z.string().refine(isStatus, "Statut inconnu"),
  cancelReason: z.string().trim().max(1000).optional(),
  details: confirmSchema,
});

export async function transitionOrder(
  input: z.input<typeof transitionSchema>,
): Promise<ActionResult> {
  try {
    const p = transitionSchema.parse(input);
    await writer(p.kind);
    const pb = await pbForRequest();
    const col = pb.collection(COLLECTION[p.kind]);
    const current = await col.getOne(p.id, {
      expand: p.kind === "bus" ? "company" : "taxi_company",
    });
    const body: Record<string, unknown> = { status: p.to };

    // Envoi : mêmes contrôles que la feuille d'envoi (le hook vérifie aussi l'adresse).
    if (p.to === "envoye" && current.status === "brouillon") {
      const missing =
        p.kind === "bus"
          ? checkBusForSend(busDraftFromRecord(current), {
              companyEmail: parseEmails(String(current.expand?.company?.email ?? "")).join(";"),
            })
          : checkTaxiForSend(taxiDraftFromRecord(current), {
              companyEmail: parseEmails(
                (current.expand?.taxi_company?.emails as string[] | undefined) ?? [],
              ).join(";"),
            });
      if (missing.length) return { ok: false, error: missing.map((m) => m.message).join(" · ") };
    }
    if (p.to === "annule") body.cancel_reason = p.cancelReason ?? "";

    // Confirmation / démobilisation : heures et plaques saisies dans la même requête.
    if (p.kind === "bus" && (p.details?.buses || p.details?.demob)) {
      const buses = busDraftFromRecord(current).buses;
      for (const b of p.details.buses ?? []) {
        const bus = buses[b.index];
        if (!bus) continue;
        bus.confirmed = b.confirmed || bus.confirmed;
        bus.plate = b.plate || bus.plate;
        bus.driver = b.driver || bus.driver;
      }
      for (const b of p.details.demob ?? []) {
        const bus = buses[b.index];
        if (bus) bus.demob = b.demob || bus.demob;
      }
      body.buses = buses;
    }
    if (p.kind === "taxi" && p.details?.confirmed_time)
      body.confirmed_time = p.details.confirmed_time;

    await col.update(p.id, body);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------------------------------
// Duplication et modèles

/** Copie une commande en nouveau brouillon daté d'aujourd'hui (heures confirmées, plaques, démob. vidées). */
export async function duplicateOrder(input: {
  kind: OrderKind;
  id: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const kind = kindSchema.parse(input.kind);
    const id = idSchema.parse(input.id);
    const user = await writer(kind);
    const pb = await pbForRequest();
    const src = await pb.collection(COLLECTION[kind]).getOne(id);
    if (kind === "bus") {
      const d = busDraftFromRecord(src);
      const draft: BusDraft = {
        ...d,
        order_date: brusselsDay(),
        call_time: brusselsTime(),
        buses: d.buses
          .filter((b) => !b.cancelled)
          .map((b) => ({
            ...emptyBus(b.planned),
            specific_route: b.specific_route,
            origin: b.origin,
            destination: b.destination,
          })),
      };
      if (draft.buses.length === 0) draft.buses = [emptyBus()];
      const r = await pb.collection("bus_orders").create({
        ...busDraftToRecord(draft),
        status: "brouillon",
        created_by: user.id,
      });
      return { ok: true, data: { id: r.id } };
    }
    const d = taxiDraftFromRecord(src);
    const draft: TaxiDraft = {
      ...d,
      trip_day: brusselsDay(),
      confirmed_time: "",
      return_day: d.round_trip ? brusselsDay() : "",
    };
    const r = await pb
      .collection("taxi_orders")
      .create({ ...(await taxiBody(draft, user)), status: "brouillon", created_by: user.id });
    return { ok: true, data: { id: r.id } };
  } catch (e) {
    return fail(e);
  }
}

const templateSchema = z.object({
  kind: kindSchema,
  name: z.string().trim().min(2, "Nom trop court").max(120),
  data: z.unknown(),
});

/** Enregistre la saisie courante comme modèle partagé (sans date, heures confirmées ni plaques). */
export async function saveTemplate(
  input: z.input<typeof templateSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const p = templateSchema.parse(input);
    const user = await writer(p.kind);
    let data: unknown;
    if (p.kind === "bus") {
      const d = busDraftSchema.parse(p.data);
      data = {
        ...d,
        order_date: "",
        call_time: "",
        buses: d.buses.map((b) => ({
          ...emptyBus(b.planned),
          specific_route: b.specific_route,
          origin: b.origin,
          destination: b.destination,
        })),
      };
    } else {
      const d = taxiDraftSchema.parse(p.data);
      data = { ...d, trip_day: "", return_day: "", confirmed_time: "" };
    }
    const pb = await pbForRequest();
    const r = await pb
      .collection("order_templates")
      .create({ kind: p.kind, name: p.name, data, created_by: user.id });
    return { ok: true, data: { id: r.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTemplate(input: {
  kind: OrderKind;
  id: string;
}): Promise<ActionResult> {
  try {
    await writer(kindSchema.parse(input.kind));
    const pb = await pbForRequest();
    await pb.collection("order_templates").delete(idSchema.parse(input.id));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------------------------------
// Référentiels à la volée

export async function findPmrClients(q: string): Promise<ActionResult<PmrClient[]>> {
  try {
    const user = await requireUser();
    if (!can(user, "pmr:read")) return { ok: true, data: [] };
    if (q.trim().length < 2) return { ok: true, data: [] };
    return { ok: true, data: await searchPmrClients(q) };
  } catch (e) {
    return fail(e);
  }
}

const driverSchema = z.object({
  company: idSchema,
  name: z.string().trim().min(2, "Nom trop court").max(200),
  phone: z.string().trim().max(100).default(""),
});

export async function addDriver(
  input: z.input<typeof driverSchema>,
): Promise<ActionResult<{ id: string; name: string; phone: string; company: string }>> {
  try {
    const p = driverSchema.parse(input);
    await writer("bus");
    const pb = await pbForRequest();
    const r = await pb.collection("bus_drivers").create(p);
    return { ok: true, data: { id: r.id, name: p.name, phone: p.phone, company: p.company } };
  } catch (e) {
    return fail(e);
  }
}

const pmrClientSchema = z.object({
  last_name: z.string().trim().min(1, "Nom manquant").max(200),
  first_name: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(100).default(""),
  type: z.string().trim().max(50).default(""),
});

/** Fiche client PMR minimale créée depuis une commande taxi (complétée ensuite dans le module PMR). */
export async function createPmrClient(
  input: z.input<typeof pmrClientSchema>,
): Promise<ActionResult<PmrClient>> {
  try {
    const p = pmrClientSchema.parse(input);
    const user = await requireUser();
    if (!can(user, "pmr:write")) return { ok: false, error: "Droit PMR manquant." };
    const pb = await pbForRequest();
    const r = await pb.collection("pmr_clients").create({ ...p, updated_by: user.id });
    return {
      ok: true,
      data: {
        id: r.id,
        lastName: p.last_name,
        firstName: p.first_name,
        phone: p.phone,
        type: p.type,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------------------------------
// Panneau de détail du suivi (lecture, avec le jeton de l'agent)

export type OrderPanel = {
  meta: Awaited<ReturnType<typeof getBusOrder>>["meta"];
  events: OrderEvent[];
  facts: { label: string; value: string }[];
  buses: BusDraft["buses"];
  companyId: string;
  drivers: { id: string; name: string; company: string }[];
};

export async function loadOrderPanel(input: {
  kind: OrderKind;
  id: string;
}): Promise<ActionResult<OrderPanel>> {
  try {
    const kind = kindSchema.parse(input.kind);
    const id = idSchema.parse(input.id);
    const user = await requireUser();
    if (!can(user, kind === "bus" ? "otto:read" : "generate_taxi:read"))
      return { ok: false, error: "Accès refusé." };
    const events = await listEvents(kind, id);
    if (kind === "bus") {
      const o = await getBusOrder(id);
      const ref = await busReference();
      const d = o.draft;
      const driver = (did: string) => ref.drivers.find((x) => x.id === did)?.name ?? "";
      return {
        ok: true,
        data: {
          meta: o.meta,
          events,
          companyId: d.company,
          buses: d.buses,
          drivers: ref.drivers.filter((x) => x.company === d.company),
          facts: [
            {
              label: "Date",
              value: `${formatShortDay(d.order_date)}${d.call_time ? ` · appel ${d.call_time}` : ""}`,
            },
            {
              label: "Trajet",
              value: `${d.origin || "?"} → ${d.destination || "?"}${d.direct ? " (direct)" : ""}${d.round_trip ? " · A-R" : ""}`,
            },
            {
              label: "Société",
              value: o.company
                ? `${o.company.name}${o.company.phone ? ` · ${o.company.phone}` : ""}`
                : "—",
            },
            { label: "Motif", value: d.reason || "—" },
            { label: "Relation", value: d.relation || "—" },
            ...d.buses.map((b, i) => ({
              label: `Bus ${i + 1}`,
              value: b.cancelled
                ? "Annulé"
                : [
                    b.planned && `prévu ${b.planned}`,
                    b.confirmed && `confirmé ${b.confirmed}`,
                    b.plate,
                    driver(b.driver),
                    b.demob && `démob. ${b.demob}`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—",
            })),
          ],
        },
      };
    }
    const o = await getTaxiOrder(id);
    const d = o.draft;
    return {
      ok: true,
      data: {
        meta: o.meta,
        events,
        companyId: d.taxi_company,
        buses: [],
        drivers: [],
        facts: [
          {
            label: "Prise en charge",
            value: `${formatShortDay(d.trip_day)} ${d.trip_time}${d.confirmed_time ? ` · confirmé ${d.confirmed_time}` : ""}`,
          },
          {
            label: "Trajet",
            value: `${d.from_station || "?"}${d.via_station ? ` → ${d.via_station}` : ""} → ${d.to_station || "?"}`,
          },
          ...(d.round_trip
            ? [
                {
                  label: "Retour",
                  value: `${formatShortDay(d.return_day)} ${d.return_time} · ${d.return_from} → ${d.return_to}`,
                },
              ]
            : []),
          { label: "Taxi", value: o.company?.name ?? o.snapshot.taxiName ?? "—" },
          {
            label: "Passager",
            value: d.is_pmr
              ? `PMR (${d.pmr_count}) · ${d.pmr_reason || "cause ?"}`
              : `${d.passengers} passager(s)`,
          },
          { label: "Facturation", value: d.billing },
        ],
      },
    };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------------------------------
// Remise B201 (une par jour) : commentaires par période et transports hors outil

const b201Schema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: notesSchema,
  manual: z.array(manualEntrySchema).max(200),
  expectedUpdated: z.string().nullable(),
});

export async function saveB201(
  input: z.input<typeof b201Schema>,
): Promise<ActionResult<{ id: string; updated: string }>> {
  try {
    const p = b201Schema.parse(input);
    const user = await requireUser();
    if (!can(user, "b201:write")) return { ok: false, error: "Droit d'écriture B201 manquant." };
    const pb = await pbForRequest();
    const current = await pb
      .collection("b201_reports")
      .getFirstListItem(pb.filter("day = {:day}", { day: p.day }))
      .catch(() => null);
    // Verrou optimiste : deux agents sur la même B201 (le jour n'est jamais modifiable : bug B1 de BACO).
    if (current && current.updated !== p.expectedUpdated) throw new ConflictError();
    const body = { notes: p.notes, manual: p.manual, updated_by: user.id };
    const r = current
      ? await pb.collection("b201_reports").update(current.id, body)
      : await pb.collection("b201_reports").create({ ...body, day: p.day });
    return { ok: true, data: { id: r.id, updated: r.updated as string } };
  } catch (e) {
    return fail(e);
  }
}
