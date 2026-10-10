"use server";

import { unstable_rethrow } from "next/navigation";
import { ClientResponseError } from "pocketbase";
import { z } from "zod";

import { can, isAdmin } from "@/lib/permissions";
import { normalizeTrain, type Train } from "@/lib/ops/irail";
import {
  ASSIST_STATUSES,
  clientSchema,
  EQUIPMENT_STATES,
  equipmentSchema,
  stationKey,
  type AleaDwell,
} from "@/lib/pmr/model";
import { requireUser, type SessionUser } from "@/server/auth";
import { train as irailTrain } from "@/server/irail";
import { pbForRequest } from "@/server/data/orders";
import { isValidDay } from "@/lib/orders/time";
import {
  getAssist,
  getClientDetail,
  listPmrEvents,
  type Assist,
  type ClientDetail,
  type PmrEvent,
} from "@/server/data/pmr";

// Écritures du module PMR : Server Actions validées par zod, jeton de l'agent ; règles et hooks PocketBase
// revérifient (droits, transitions, auteur, historique).

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

function coordinator(user: SessionUser) {
  return isAdmin(user) || user.role === "moderator";
}

// ---------------------------------------------------------------------------------------------------
// Prestations

export async function transitionAssist(input: {
  id: string;
  to: string;
  reason?: string;
}): Promise<Result> {
  try {
    const user = await need("deplacements:write");
    const p = z
      .object({
        id: pbId,
        to: z.enum(ASSIST_STATUSES),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(input);
    const pb = await pbForRequest();
    await pb.collection("pmr_assists").update(p.id, {
      status: p.to,
      cancel_reason: p.reason ?? "",
      updated_by: user.id,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function loadAssistPanel(
  id: string,
): Promise<Result<{ assist: Assist; events: PmrEvent[] }>> {
  try {
    const user = await need("deplacements:read");
    const [assist, events] = await Promise.all([
      getAssist(id, can(user, "pmr:read")),
      listPmrEvents("assist", pbId.parse(id)),
    ]);
    return { ok: true, data: { assist, events } };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------------------------------
// Clients

export async function saveClient(
  id: string | null,
  input: unknown,
): Promise<Result<{ id: string; duplicates?: { id: string; name: string }[] }>> {
  try {
    const user = await need("pmr:write");
    const c = clientSchema.parse(input);
    const pb = await pbForRequest();
    const body = {
      ...c,
      type_detail: c.type === "AUTRE" ? c.type_detail : "",
      updated_by: user.id,
    };
    if (id) {
      await pb.collection("pmr_clients").update(pbId.parse(id), body);
      return { ok: true, data: { id } };
    }
    const r = await pb.collection("pmr_clients").create({ ...body, created_by: user.id });
    return { ok: true, data: { id: r.id } };
  } catch (e) {
    return fail(e);
  }
}

/** Fiches proches (même nom, ou même téléphone) proposées avant de créer un doublon. */
export async function findDuplicates(input: {
  last_name: string;
  phone: string;
}): Promise<Result<{ id: string; name: string }[]>> {
  try {
    await need("pmr:read");
    const p = z
      .object({ last_name: z.string().trim().max(200), phone: z.string().trim().max(100) })
      .parse(input);
    const digits = p.phone.replace(/\D/g, "");
    if (p.last_name.length < 2 && digits.length < 6) return { ok: true, data: [] };
    const pb = await pbForRequest();
    const ors: string[] = [];
    if (p.last_name.length >= 2) ors.push(pb.filter("last_name ~ {:n}", { n: p.last_name }));
    // Téléphones saisis avec espaces ou points : chiffres en motif « %1%2%3%4%5%6% ».
    if (digits.length >= 6)
      ors.push(pb.filter("phone ~ {:d}", { d: `%${digits.slice(-6).split("").join("%")}%` }));
    const res = await pb.collection("pmr_clients").getList(1, 5, { filter: ors.join(" || ") });
    return {
      ok: true,
      data: res.items.map((r) => ({ id: r.id, name: `${r.last_name} ${r.first_name}`.trim() })),
    };
  } catch (e) {
    return fail(e);
  }
}

export async function setClientArchived(id: string, archived: boolean): Promise<Result> {
  try {
    const user = await need("pmr:write");
    const pb = await pbForRequest();
    await pb
      .collection("pmr_clients")
      .update(pbId.parse(id), { archived: z.boolean().parse(archived), updated_by: user.id });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function loadClientPanel(id: string): Promise<Result<ClientDetail>> {
  try {
    const user = await need("pmr:read");
    return {
      ok: true,
      data: await getClientDetail(id, {
        canAssists: can(user, "deplacements:read"),
        canTaxi: can(user, "generate_taxi:read"),
      }),
    };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------------------------------
// Matériel

export async function setEquipmentState(input: {
  id: string;
  state: string;
  note?: string;
  repair?: boolean;
}): Promise<Result> {
  try {
    const user = await need("pmr:write");
    const p = z
      .object({
        id: pbId,
        state: z.enum(EQUIPMENT_STATES),
        note: z.string().trim().max(500).optional(),
        repair: z.boolean().optional(),
      })
      .parse(input);
    const pb = await pbForRequest();
    await pb.collection("pmr_equipment").update(p.id, {
      state: p.state,
      ...(p.note === undefined ? {} : { state_note: p.note }),
      ...(p.repair === undefined ? {} : { repair_requested: p.repair }),
      updated_by: user.id,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Création et modification complète : coordinateurs (décision du 8 octobre 2026). */
export async function saveEquipment(
  id: string | null,
  input: unknown,
): Promise<Result<{ id: string }>> {
  try {
    const user = await need("pmr:write");
    if (!coordinator(user)) throw new Error("DROIT:Réservé aux coordinateurs.");
    const eq = equipmentSchema.parse(input);
    const pb = await pbForRequest();
    const body = { ...eq, zone: eq.zone || null, updated_by: user.id };
    const r = id
      ? await pb.collection("pmr_equipment").update(pbId.parse(id), body)
      : await pb.collection("pmr_equipment").create(body);
    return { ok: true, data: { id: r.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function loadEquipmentEvents(id: string): Promise<Result<PmrEvent[]>> {
  try {
    await need("pmr:read");
    return { ok: true, data: await listPmrEvents("equipment", pbId.parse(id)) };
  } catch (e) {
    return fail(e);
  }
}

export async function saveZone(
  id: string | null,
  input: { code: string; label: string; district: string; stations: string },
): Promise<Result> {
  try {
    const user = await requireUser();
    if (!coordinator(user)) throw new Error("DROIT:Réservé aux coordinateurs.");
    const p = z
      .object({
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z0-9]{2,10}$/, "Code de 2 à 10 lettres ou chiffres"),
        label: z.string().trim().max(100),
        district: z.enum(["Sud-Ouest", "Sud-Est", "Centre", ""]),
        stations: z.string().max(5000),
      })
      .parse(input);
    const stations = [
      ...new Set(
        p.stations
          .split(/[,;\n]+/)
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
      ),
    ];
    const body = { code: p.code, label: p.label, district: p.district || null, stations };
    const pb = await pbForRequest();
    if (id) await pb.collection("pmr_zones").update(pbId.parse(id), body);
    else await pb.collection("pmr_zones").create(body);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------------------------------
// Export ALEA : temps d'arrêt prévu du train à la gare (horaire ATMS synchronisé par l'extension, repli iRail), pour le logigramme « Obligatoire ».

const dwellSchema = z
  .array(
    z.object({
      key: z.string().max(200),
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      train: z.string().max(40),
      station: z.string().max(120),
    }),
  )
  .max(300);

/** Abréviation PtCar → nom français (référentiel « Annuaire et données »), gardé une heure en mémoire. */
let ptcarNames: { at: number; map: Map<string, string> } | null = null;
async function ptcarMap(
  pb: Awaited<ReturnType<typeof pbForRequest>>,
): Promise<Map<string, string>> {
  if (ptcarNames && Date.now() - ptcarNames.at < 3_600_000) return ptcarNames.map;
  const rows = await pb.collection("ptcar").getFullList({ fields: "abbr,name_fr", batch: 1000 });
  const map = new Map<string, string>();
  for (const r of rows) {
    const abbr = String(r.abbr ?? "")
      .trim()
      .toUpperCase();
    if (abbr && r.name_fr) map.set(abbr, String(r.name_fr));
  }
  ptcarNames = { at: Date.now(), map };
  return map;
}

type AtmsStop = { abbr: string; name: string; dwell: number; position: string };

/** Cherche la gare DICOS dans une liste d'arrêts (nom exact sans accents, sinon début de nom). */
function findStop<T>(stops: T[], name: (s: T) => string, station: string): number {
  const want = stationKey(station);
  if (!want) return -1;
  let i = stops.findIndex((s) => stationKey(name(s)) === want);
  if (i < 0)
    i = stops.findIndex((s) => {
      const k = stationKey(name(s));
      return !!k && (k.startsWith(want) || want.startsWith(k));
    });
  return i;
}

export async function aleaDwell(
  input: z.input<typeof dwellSchema>,
): Promise<Result<Record<string, AleaDwell>>> {
  try {
    await need("pmr:read");
    const items = dwellSchema.parse(input);
    const out: Record<string, AleaDwell> = {};
    const pb = await pbForRequest();

    // 1. Horaires ATMS synchronisés par l'extension (source préférée, demande du 9 oct. 2026).
    const wanted = [
      ...new Set(
        items
          .filter((it) => /^\d{1,6}$/.test(it.train.trim()))
          .map((it) => `${it.day}|${it.train.trim()}`),
      ),
    ].slice(0, 100);
    const atms = new Map<string, AtmsStop[]>();
    if (wanted.length) {
      const filter = wanted.map((k, i) => `(day = {:d${i}} && train = {:t${i}})`).join(" || ");
      const params: Record<string, string> = {};
      wanted.forEach((k, i) => {
        const [d, t] = k.split("|") as [string, string];
        params[`d${i}`] = d;
        params[`t${i}`] = t;
      });
      try {
        const rows = await pb
          .collection("train_schedules")
          .getFullList({ filter: pb.filter(filter, params), fields: "day,train,stops" });
        const names = rows.length
          ? await ptcarMap(pb).catch(() => new Map<string, string>())
          : new Map();
        for (const r of rows) {
          const stops = (Array.isArray(r.stops) ? r.stops : []) as AtmsStop[];
          atms.set(
            `${r.day}|${r.train}`,
            stops.map((s) => ({ ...s, name: names.get(String(s.abbr).toUpperCase()) ?? s.name })),
          );
        }
      } catch {
        // Collection absente ou illisible : on passe à iRail.
      }
    }

    // 2. Repli iRail : un appel par train et par jour (cache serveur), 60 trains au plus, 3 à la fois.
    const trains = new Map<string, Promise<Train | null>>();
    const load = (id: string, day: string) => {
      const k = `${id}|${day}`;
      if (!trains.has(k)) {
        if (trains.size >= 60) return Promise.resolve(null);
        trains.set(
          k,
          irailTrain(id, day)
            .then((r) => r.train)
            .catch(() => null),
        );
      }
      return trains.get(k)!;
    };
    const queue = [...items];
    const worker = async () => {
      for (let it = queue.shift(); it; it = queue.shift()) {
        if (/^taxi/i.test(it.train)) {
          out[it.key] = { seconds: null, position: "taxi" };
          continue;
        }
        const sched = atms.get(`${it.day}|${it.train.trim()}`);
        if (sched) {
          const i = findStop(sched, (s) => s.name, it.station);
          const stop = i >= 0 ? sched[i] : undefined;
          if (stop) {
            out[it.key] = {
              seconds: stop.position === "stop" ? stop.dwell : 0,
              position:
                stop.position === "origin"
                  ? "origin"
                  : stop.position === "terminus"
                    ? "terminus"
                    : "stop",
              source: "atms",
            };
            continue;
          }
        }
        const id = normalizeTrain(it.train);
        const t = id ? await load(id, it.day) : null;
        const stops = t?.stops ?? [];
        const i = findStop(stops, (s) => s.station, it.station);
        const stop = i >= 0 ? stops[i] : undefined;
        out[it.key] = !stop
          ? { seconds: null, position: "unknown" }
          : i === 0
            ? { seconds: 0, position: "origin", source: "irail" }
            : i === stops.length - 1
              ? { seconds: 0, position: "terminus", source: "irail" }
              : {
                  seconds: Math.max(0, Math.round((stop.at - stop.arrivalAt) / 1000)),
                  position: "stop",
                  source: "irail",
                };
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    return { ok: true, data: out };
  } catch (e) {
    unstable_rethrow(e);
    return fail(e);
  }
}

// --- ALEA « encodé » (demande du 10 oct. 2026) : blocs cochés une fois saisis dans ALEA, partagés par l'équipe. ---

export type AleaMark = { by: string; at: string };
const markKind = z.enum(["pmr", "groupe"]);
const markBlock = z.string().min(1).max(300);

/** Blocs déjà encodés parmi ceux affichés (clé du bloc → auteur, heure). */
export async function aleaMarks(
  kind: "pmr" | "groupe",
  blocks: string[],
): Promise<Result<Record<string, AleaMark>>> {
  try {
    await need("deplacements:read");
    const k = markKind.parse(kind);
    const list = z.array(markBlock).max(500).parse(blocks);
    const days = [...new Set(list.map((b) => b.slice(0, 10)).filter(isValidDay))];
    if (!days.length) return { ok: true, data: {} };
    const pb = await pbForRequest();
    const rows = await pb.collection("alea_marks").getFullList({
      filter: pb.filter(
        `kind = {:k} && (${days.map((_, i) => `day = {:d${i}}`).join(" || ")})`,
        Object.fromEntries([["k", k], ...days.map((d, i) => [`d${i}`, d])]),
      ),
      expand: "marked_by",
      fields: "block,created,expand.marked_by.name,expand.marked_by.username",
    });
    const wanted = new Set(list);
    const out: Record<string, AleaMark> = {};
    for (const r of rows) {
      if (!wanted.has(String(r.block))) continue;
      const u = (r.expand as { marked_by?: { name?: string; username?: string } } | undefined)
        ?.marked_by;
      out[String(r.block)] = { by: u?.name || u?.username || "?", at: String(r.created) };
    }
    return { ok: true, data: out };
  } catch (e) {
    unstable_rethrow(e);
    return fail(e);
  }
}

/** Coche (encodé) ou décoche un bloc ALEA. */
export async function setAleaMark(
  kind: "pmr" | "groupe",
  block: string,
  done: boolean,
): Promise<Result<AleaMark | null>> {
  try {
    const user = await need("deplacements:write");
    const k = markKind.parse(kind);
    const b = markBlock.parse(block);
    const day = b.slice(0, 10);
    if (!isValidDay(day)) throw new z.ZodError([]);
    const pb = await pbForRequest();
    const existing = await pb
      .collection("alea_marks")
      .getFirstListItem(pb.filter("kind = {:k} && block = {:b}", { k, b }))
      .catch(() => null);
    if (!done) {
      if (existing) await pb.collection("alea_marks").delete(existing.id);
      return { ok: true, data: null };
    }
    if (existing)
      return { ok: true, data: { by: user.name || user.username, at: existing.created } };
    try {
      const rec = await pb
        .collection("alea_marks")
        .create({ day, kind: k, block: b, marked_by: user.id });
      return { ok: true, data: { by: user.name || user.username, at: String(rec.created) } };
    } catch (err) {
      // Coché au même moment par un collègue (index unique) : on relit au lieu d'afficher une erreur.
      const now = await pb
        .collection("alea_marks")
        .getFirstListItem(pb.filter("kind = {:k} && block = {:b}", { k, b }), {
          expand: "marked_by",
        })
        .catch(() => null);
      if (!now) throw err;
      const u = (now.expand as { marked_by?: { name?: string; username?: string } } | undefined)
        ?.marked_by;
      return { ok: true, data: { by: u?.name || u?.username || "?", at: String(now.created) } };
    }
  } catch (e) {
    unstable_rethrow(e);
    return fail(e);
  }
}
