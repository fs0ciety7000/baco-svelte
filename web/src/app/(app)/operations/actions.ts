"use server";

import { unstable_rethrow } from "next/navigation";
import { ClientResponseError } from "pocketbase";
import { z } from "zod";

import { normalizeTrain, parseFavorites, stationId } from "@/lib/ops/irail";
import { DUTY_DISTRICTS, entrySchema, RETIRE_WINDOW_MS } from "@/lib/ops/log";
import { brusselsDay, brusselsToUtc, pbDate } from "@/lib/orders/time";
import { can, isAdmin } from "@/lib/permissions";
import { requireUser, type SessionUser } from "@/server/auth";
import {
  getLogEntry,
  listLogEvents,
  listNotifications,
  searchLinkables,
  type Linkable,
  type LogEntry,
  type LogEvent,
  type Notification,
} from "@/server/data/ops";
import { pbForRequest, toPbInstant } from "@/server/data/orders";

// Écritures du module Opérations : Server Actions validées par zod, jeton de l'agent ; règles et hooks PocketBase
// revérifient (auteur, retrait, mentions, historique, notifications). Les pièces jointes passent par la route
// /api/operations/main-courante/[id]/fichiers (multipart).

type Result<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

const pbId = z.string().regex(/^[a-z0-9]{15}$/);

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof ClientResponseError) {
    const data = e.response?.data as Record<string, { message?: string }> | undefined;
    const field = data ? Object.entries(data)[0] : undefined;
    if (e.status === 404) return { ok: false, error: "Fiche introuvable ou accès refusé." };
    return {
      ok: false,
      error: field
        ? `${field[0]} : ${field[1]?.message ?? "invalide"}`
        : e.response?.message || "Refusé.",
    };
  }
  if (e instanceof z.ZodError)
    return { ok: false, error: e.issues[0]?.message ?? "Saisie invalide." };
  if (e instanceof Error && e.message.startsWith("DROIT:"))
    return { ok: false, error: e.message.slice(6) };
  return { ok: false, error: "Erreur inattendue, réessaie." };
}

async function need(perm: string): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, perm)) throw new Error("DROIT:Droit manquant pour cette action.");
  return user;
}

const coordinator = (u: SessionUser) => isAdmin(u) || u.role === "moderator";

function entryBody(p: z.output<typeof entrySchema>) {
  return {
    body: p.body,
    category: p.category,
    occurred_at: toPbInstant(brusselsToUtc(p.day, p.time)),
    urgent: p.urgent,
    pinned_until: p.pinUntilDay
      ? toPbInstant(brusselsToUtc(p.pinUntilDay, p.pinUntilTime || "23:59"))
      : "",
    train: p.train,
    bus_order: p.busOrder || null,
    taxi_order: p.taxiOrder || null,
    pmr_assist: p.pmrAssist || null,
    level_crossing: p.levelCrossing || null,
  };
}

// ---------------------------------------------------------------------------------------------------
// Main courante

export async function createEntry(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await need("journal:write");
    const p = entrySchema.parse(input);
    const pb = await pbForRequest();
    const r = await pb.collection("ops_log").create({ ...entryBody(p), author: user.id });
    return { ok: true, data: { id: r.id } };
  } catch (e) {
    return fail(e);
  }
}

/** Verrou optimiste : refusé si l'entrée a changé depuis son ouverture. */
export async function updateEntry(input: {
  id: string;
  expectedUpdated: string;
  entry: unknown;
}): Promise<Result> {
  try {
    await need("journal:write");
    const id = pbId.parse(input.id);
    const p = entrySchema.parse(input.entry);
    const pb = await pbForRequest();
    const current = await pb.collection("ops_log").getOne(id, { fields: "updated" });
    if (current.updated !== input.expectedUpdated)
      return {
        ok: false,
        error: "L'entrée a été modifiée entre-temps : rouvre-la pour voir la dernière version.",
      };
    await pb.collection("ops_log").update(id, entryBody(p));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function retireEntry(input: { id: string; reason: string }): Promise<Result> {
  try {
    const user = await need("journal:write");
    const p = z
      .object({ id: pbId, reason: z.string().trim().min(1, "Le motif est obligatoire.").max(500) })
      .parse(input);
    const pb = await pbForRequest();
    const current = await pb.collection("ops_log").getOne(p.id, { fields: "author,created" });
    const age = Date.now() - (pbDate(current.created)?.getTime() ?? 0);
    if (!coordinator(user) && (current.author !== user.id || age > RETIRE_WINDOW_MS))
      return { ok: false, error: "Passé 15 minutes, seul un coordinateur peut retirer l'entrée." };
    await pb.collection("ops_log").update(p.id, { status: "retiree", retired_reason: p.reason });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function restoreEntry(id: string): Promise<Result> {
  try {
    const user = await need("journal:write");
    if (!coordinator(user))
      return { ok: false, error: "Seul un coordinateur peut rétablir une entrée." };
    const pb = await pbForRequest();
    await pb.collection("ops_log").update(pbId.parse(id), { status: "active" });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeAttachment(input: { id: string; name: string }): Promise<Result> {
  try {
    await need("journal:write");
    const p = z.object({ id: pbId, name: z.string().regex(/^[\w.-]{1,200}$/) }).parse(input);
    const pb = await pbForRequest();
    await pb.collection("ops_log").update(p.id, { "attachments-": [p.name] });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setRead(input: { id: string; read: boolean }): Promise<Result> {
  try {
    const user = await need("journal:read");
    const p = z.object({ id: pbId, read: z.boolean() }).parse(input);
    const pb = await pbForRequest();
    const existing = await pb
      .collection("ops_log_reads")
      .getFirstListItem(pb.filter("entry = {:e} && user = {:u}", { e: p.id, u: user.id }))
      .catch(() => null);
    if (p.read && !existing)
      await pb.collection("ops_log_reads").create({ entry: p.id, user: user.id });
    if (!p.read && existing) await pb.collection("ops_log_reads").delete(existing.id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** « Tout marquer lu » (audit UX du 9 oct. 2026 : 36 non-lus à marquer un par un). 200 entrées au plus. */
export async function markAllRead(ids: string[]): Promise<Result<{ marked: number }>> {
  try {
    const user = await need("journal:read");
    const list = z.array(pbId).max(200).parse(ids);
    if (!list.length) return { ok: true, data: { marked: 0 } };
    const pb = await pbForRequest();
    const already = await pb.collection("ops_log_reads").getFullList({
      filter: pb.filter(`user = {:u} && (${list.map((_, i) => `entry = {:e${i}}`).join(" || ")})`, {
        u: user.id,
        ...Object.fromEntries(list.map((id, i) => [`e${i}`, id])),
      }),
      fields: "entry",
    });
    const done = new Set(already.map((r) => r.entry as string));
    let marked = 0;
    for (const id of list) {
      if (done.has(id)) continue;
      await pb
        .collection("ops_log_reads")
        .create({ entry: id, user: user.id })
        .then(() => marked++)
        .catch(() => null);
    }
    return { ok: true, data: { marked } };
  } catch (e) {
    return fail(e);
  }
}

export async function loadEntryPanel(
  id: string,
): Promise<Result<{ entry: LogEntry; events: LogEvent[] }>> {
  try {
    await need("journal:read");
    const [entry, events] = await Promise.all([getLogEntry(id), listLogEvents(id)]);
    return { ok: true, data: { entry, events } };
  } catch (e) {
    return fail(e);
  }
}

export async function searchLinks(input: { kind: string; q: string }): Promise<Result<Linkable[]>> {
  try {
    const user = await need("journal:write");
    const p = z
      .object({ kind: z.enum(["bus", "taxi", "pmr", "pn"]), q: z.string().max(40) })
      .parse(input);
    const perm = {
      bus: "bus:read",
      taxi: "taxi:read",
      pmr: "deplacements:read",
      pn: "carte_pn:read",
    }[p.kind];
    if (!can(user, perm)) return { ok: true, data: [] };
    return { ok: true, data: await searchLinkables(p.kind, p.q) };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------------------------------
// Notifications (les siennes seulement : règles PocketBase)

export async function loadNotifications(): Promise<
  Result<{ items: Notification[]; unread: number }>
> {
  try {
    await requireUser();
    return { ok: true, data: await listNotifications() };
  } catch (e) {
    return fail(e);
  }
}

export async function markNotifications(input: { ids: string[] | "all" }): Promise<Result> {
  try {
    await requireUser();
    const pb = await pbForRequest();
    const at = toPbInstant(new Date().toISOString());
    const ids =
      input.ids === "all"
        ? (
            await pb
              .collection("notifications")
              .getFullList({ filter: 'read_at = ""', fields: "id" })
          ).map((n) => n.id)
        : z.array(pbId).max(100).parse(input.ids);
    for (const id of ids) await pb.collection("notifications").update(id, { read_at: at });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------------------------------
// Gares favorites (préférences de l'agent) et trains suivis

export async function toggleFavoriteStation(input: {
  id: string;
  name: string;
}): Promise<Result<{ favorite: boolean }>> {
  try {
    const user = await need("live:read");
    const p = z.object({ id: stationId, name: z.string().trim().min(1).max(80) }).parse(input);
    const pb = await pbForRequest();
    const record = await pb.collection("users").getOne(user.id, { fields: "preferences" });
    const prefs = ((record.preferences as Record<string, unknown> | null) ?? {}) as Record<
      string,
      unknown
    >;
    const ops = (prefs.operations as Record<string, unknown> | undefined) ?? {};
    const list = parseFavorites(prefs);
    const favorite = !list.some((f) => f.id === p.id);
    if (favorite && list.length >= 8) return { ok: false, error: "8 gares favorites au maximum." };
    const next = favorite
      ? [...list, { id: p.id, name: p.name }]
      : list.filter((f) => f.id !== p.id);
    await pb.collection("users").update(user.id, {
      preferences: { ...prefs, operations: { ...ops, favoriteStations: next } },
    });
    return { ok: true, data: { favorite } };
  } catch (e) {
    return fail(e);
  }
}

export async function watchTrain(input: {
  train: string;
  day?: string;
  label?: string;
}): Promise<Result<{ id: string }>> {
  try {
    const user = await need("live:read");
    const p = z
      .object({
        train: z
          .string()
          .transform(normalizeTrain)
          .pipe(z.string().min(1, "Numéro de train illisible")),
        day: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .default(brusselsDay()),
        label: z.string().trim().max(120).default(""),
      })
      .parse(input);
    const pb = await pbForRequest();
    const r = await pb
      .collection("train_watches")
      .create({ user: user.id, train: p.train, day: p.day, label: p.label, threshold_min: 5 });
    return { ok: true, data: { id: r.id } };
  } catch (e) {
    if (
      e instanceof ClientResponseError &&
      e.status === 400 &&
      JSON.stringify(e.response).includes("unique")
    )
      return { ok: false, error: "Ce train est déjà suivi." };
    return fail(e);
  }
}

export async function unwatchTrain(id: string): Promise<Result> {
  try {
    await need("live:read");
    const pb = await pbForRequest();
    await pb.collection("train_watches").delete(pbId.parse(id));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------------------------------
// Passages à niveau et dépôts (coordinateurs, carte_pn:write)

const crossingSchema = z.object({
  line: z
    .string()
    .trim()
    .toUpperCase()
    .transform((s) => s.replace(/^L\.?\s*/, "L."))
    .pipe(z.string().regex(/^L\.[0-9]{1,3}[A-Z]?$/, "Ligne au format L.94")),
  number: z
    .string()
    .trim()
    .toLowerCase()
    .transform((s) => s.replace(/^pn\s*/, "").replace(/\s*(bis|ter)$/, " $1"))
    .pipe(z.string().regex(/^[0-9]{1,4}( bis| ter)?$/, "N° au format 12, 12 bis")),
  bk: z.coerce.number().min(0).max(1000).default(0),
  address: z.string().trim().max(500).default(""),
  lat: z.coerce.number().min(49).max(52).or(z.literal(0)).default(0),
  lon: z.coerce.number().min(2).max(7).or(z.literal(0)).default(0),
  zone: z
    .string()
    .regex(/^$|^[A-Z0-9]{2,10}$/)
    .default(""),
  notes: z.string().trim().max(1000).default(""),
});

export async function saveCrossing(input: {
  id?: string;
  expectedUpdated?: string;
  data: unknown;
}): Promise<Result<{ id: string }>> {
  try {
    const user = await need("carte_pn:write");
    const d = crossingSchema.parse(input.data);
    const pb = await pbForRequest();
    if (input.id) {
      const id = pbId.parse(input.id);
      const current = await pb.collection("level_crossings").getOne(id, { fields: "updated" });
      if (current.updated !== input.expectedUpdated)
        return { ok: false, error: "Le PN a été modifié entre-temps : rouvre la fiche." };
      await pb.collection("level_crossings").update(id, { ...d, updated_by: user.id });
      return { ok: true, data: { id } };
    }
    const r = await pb
      .collection("level_crossings")
      .create({ ...d, active: true, source: "csm", updated_by: user.id });
    return { ok: true, data: { id: r.id } };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------------------------------
// Districts du jour (décision du 9 oct. 2026) : l'agent coche où il travaille aujourd'hui ; les notifications
// d'urgence et des perturbations iRail suivent ces districts (hooks PocketBase).

export async function setDutyDistricts(input: string[]): Promise<Result> {
  try {
    const user = await requireUser();
    const districts = z
      .array(z.enum(DUTY_DISTRICTS))
      .max(3)
      .parse([...new Set(input)]);
    const pb = await pbForRequest();
    await pb
      .collection("users")
      .update(user.id, { duty_day: brusselsDay(), duty_districts: districts });
    return { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    return fail(e);
  }
}
