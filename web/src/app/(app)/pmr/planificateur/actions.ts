"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { ClientResponseError } from "pocketbase";
import { z } from "zod";

import { can } from "@/lib/permissions";
import { addDays, brusselsToUtc, isValidDay, pbDate } from "@/lib/orders/time";
import { PMR_TASK_TYPES } from "@/lib/pmr/dicos-pending";
import { stationKey } from "@/lib/pmr/model";
import { requireUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";

// Écritures du planificateur de tâches PMR (lot P0, 15 oct. 2026) : Server Actions validées par zod, jeton de l'agent.
// Droits revérifiés ici (`planner:write`, suppression d'une tâche DICOS : `planner:manage`) ET par les règles
// PocketBase (`1760004900`) ; auteurs et cohérence de l'attribution posés par le hook `planner.pb.js`. Verrou optimiste :
// chaque modification envoie le `updated` lu ; une tâche modifiée entre-temps (autre agent, synchro DICOS) est refusée
// avec `conflict: true` (relire puis réessayer). En « voir en tant que », le client PocketBase est en lecture seule.

export type PlannerResult<T = object> =
  ({ ok: true } & T) | { ok: false; error: string; conflict?: boolean };

const pbId = z.string().regex(/^[a-z0-9]{15}$/);
const stamp = z.string().max(40);

class Refused extends Error {}
class Conflict extends Error {}

function fail(e: unknown): { ok: false; error: string; conflict?: boolean } {
  unstable_rethrow(e);
  if (e instanceof Conflict)
    return {
      ok: false,
      conflict: true,
      error: "Tâche modifiée entre-temps (autre agent ou synchro DICOS) : relis-la puis réessaie.",
    };
  if (e instanceof Refused) return { ok: false, error: e.message };
  if (e instanceof z.ZodError)
    return { ok: false, error: e.issues[0]?.message ?? "Saisie invalide." };
  if (e instanceof ClientResponseError) {
    if (e.status === 404) return { ok: false, error: "Tâche introuvable ou accès refusé." };
    if (e.status === 403) return { ok: false, error: "Action refusée." };
    return { ok: false, error: e.response?.message || "Refusé." };
  }
  return { ok: false, error: "Erreur inattendue, réessaie." };
}

async function need(perm: string) {
  const user = await requireUser();
  if (!can(user, perm)) throw new Refused("Droit manquant pour cette action.");
  return user;
}

/** Tâche lue puis comparée au `updated` attendu (verrou optimiste). */
async function lockedTask(
  pb: Awaited<ReturnType<typeof pbForRequest>>,
  id: string,
  expected: string,
) {
  const cur = await pb.collection("planner_tasks").getOne(pbId.parse(id));
  if (pbDate(String(cur.updated))?.getTime() !== pbDate(expected)?.getTime()) throw new Conflict();
  return cur;
}

const assignSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("agent"), agentId: pbId, label: z.string().max(80).optional() }),
  z.object({ kind: z.literal("bcs"), label: z.string().trim().max(80).optional() }),
  z.object({ kind: z.literal("taxi"), label: z.string().trim().max(80).optional() }),
  z.object({ kind: z.literal("cdb"), label: z.string().trim().max(80).optional() }),
]);
export type AssignTarget = z.input<typeof assignSchema>;

/**
 * Attribue une tâche : à un agent de gare (`agentId` = fiche `quinyx_agents`), au guichet B-CS (`label` = gare du
 * guichet, défaut : la gare de la tâche), à un taxi ou au chef de bord. Une tâche « faite » le reste ; une tâche annulée
 * n'est pas attribuée. Renvoie le nouveau `updated`.
 */
export async function assignTask(
  id: string,
  target: AssignTarget,
  expectedUpdated: string,
): Promise<PlannerResult<{ updated: string }>> {
  try {
    await need("planner:write");
    const t = assignSchema.parse(target);
    const pb = await pbForRequest();
    const cur = await lockedTask(pb, id, stamp.parse(expectedUpdated));
    if (cur.status === "annulee")
      throw new Refused("Tâche annulée dans DICOS : elle ne peut pas être attribuée.");
    if (t.kind === "agent") {
      const agent = await pb
        .collection("quinyx_agents")
        .getOne(t.agentId, { fields: "id,purpose" });
      if (agent.purpose !== "gares") throw new Refused("Choisis un agent de gare.");
    }
    const r = await pb.collection("planner_tasks").update(cur.id, {
      assignee_kind: t.kind,
      assignee_agent: t.kind === "agent" ? t.agentId : "",
      assignee_label: t.kind === "bcs" ? t.label || String(cur.station ?? "") : (t.label ?? ""),
      status: cur.status === "faite" ? "faite" : "attribuee",
      origin: "manuel",
    });
    revalidatePath("/pmr/planificateur");
    return { ok: true, updated: String(r.updated) };
  } catch (e) {
    return fail(e);
  }
}

const batchItem = z.object({
  id: pbId,
  target: assignSchema,
  expectedUpdated: stamp,
});
export type AssignItem = z.input<typeof batchItem>;
export type AssignItemResult =
  | { id: string; ok: true; updated: string }
  | { id: string; ok: false; error: string; conflict?: boolean };

/**
 * Attribution groupée (proposition de l'attribution automatique, tâches liées par une correspondance ou un même train) :
 * 300 tâches au plus, droits vérifiés une fois, verrou optimiste PAR tâche, résultat par tâche (une tâche refusée ne
 * bloque pas les autres). `origin` = « auto » quand `auto` est vrai (proposition acceptée), sinon « manuel ».
 */
export async function assignTasks(
  items: AssignItem[],
  auto = false,
): Promise<PlannerResult<{ results: AssignItemResult[] }>> {
  try {
    await need("planner:write");
    const list = z.array(batchItem).min(1, "Aucune tâche.").max(300).parse(items);
    const pb = await pbForRequest();
    const agents = new Map<string, boolean>();
    const results: AssignItemResult[] = [];
    for (const it of list) {
      try {
        const cur = await lockedTask(pb, it.id, it.expectedUpdated);
        if (cur.status === "annulee")
          throw new Refused("Tâche annulée dans DICOS : elle ne peut pas être attribuée.");
        const t = it.target;
        if (t.kind === "agent") {
          let okAgent = agents.get(t.agentId);
          if (okAgent === undefined) {
            const a = await pb
              .collection("quinyx_agents")
              .getOne(t.agentId, { fields: "id,purpose" })
              .catch(() => null);
            okAgent = a?.purpose === "gares";
            agents.set(t.agentId, okAgent);
          }
          if (!okAgent) throw new Refused("Choisis un agent de gare.");
        }
        const r = await pb.collection("planner_tasks").update(cur.id, {
          assignee_kind: t.kind,
          assignee_agent: t.kind === "agent" ? t.agentId : "",
          assignee_label: t.kind === "bcs" ? t.label || String(cur.station ?? "") : (t.label ?? ""),
          status: cur.status === "faite" ? "faite" : "attribuee",
          origin: auto ? "auto" : "manuel",
        });
        results.push({ id: it.id, ok: true, updated: String(r.updated) });
      } catch (e) {
        const f = fail(e);
        results.push({ id: it.id, ...f });
      }
    }
    revalidatePath("/pmr/planificateur");
    return { ok: true, results };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Doublon probable : une tâche saisie à la main correspond à une tâche DICOS (même dossier, train, sens et gare). On
 * garde la tâche DICOS et on supprime la saisie ; si seule la saisie était attribuée, son attribution passe à la tâche
 * DICOS. Correspondance revérifiée ici (jamais d'après le navigateur seul) ; droits : `planner:write`.
 */
export async function resolveDuplicate(manualId: string, dicosId: string): Promise<PlannerResult> {
  try {
    await need("planner:write");
    const pb = await pbForRequest();
    const [m, d] = await Promise.all([
      pb.collection("planner_tasks").getOne(pbId.parse(manualId)),
      pb.collection("planner_tasks").getOne(pbId.parse(dicosId)),
    ]);
    const same = (k: string) => String(m[k] ?? "") === String(d[k] ?? "");
    const trainOf = (r: typeof m) =>
      String(r.train ?? "")
        .replace(/\s+/g, "")
        .toUpperCase();
    const keyOf = (r: typeof m) => String(r.station_key || stationKey(String(r.station ?? "")));
    if (
      (m.source !== "manuel" && m.source !== "modele") ||
      (d.source !== "dicos_mission" && d.source !== "dicos_pending") ||
      !m.dossier ||
      !same("dossier") ||
      !same("kind") ||
      trainOf(m) !== trainOf(d) ||
      keyOf(m) !== keyOf(d)
    )
      throw new Refused("Ces deux tâches ne correspondent pas (dossier, train, sens ou gare).");
    if (m.assignee_kind && !d.assignee_kind && d.status !== "annulee")
      await pb.collection("planner_tasks").update(d.id, {
        assignee_kind: m.assignee_kind,
        assignee_agent: m.assignee_kind === "agent" ? m.assignee_agent : "",
        assignee_label: m.assignee_label ?? "",
        status: d.status === "faite" ? "faite" : "attribuee",
        origin: "manuel",
      });
    await pb.collection("planner_tasks").delete(m.id);
    revalidatePath("/pmr/planificateur");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Retire l'attribution d'une tâche (retour dans « À attribuer » ; une tâche annulée reste annulée). */
export async function unassignTask(
  id: string,
  expectedUpdated: string,
): Promise<PlannerResult<{ updated: string }>> {
  try {
    await need("planner:write");
    const pb = await pbForRequest();
    const cur = await lockedTask(pb, id, stamp.parse(expectedUpdated));
    const r = await pb.collection("planner_tasks").update(cur.id, {
      assignee_kind: "",
      assignee_agent: "",
      assignee_label: "",
      status: cur.status === "annulee" ? "annulee" : "a_attribuer",
      origin: "",
    });
    revalidatePath("/pmr/planificateur");
    return { ok: true, updated: String(r.updated) };
  } catch (e) {
    return fail(e);
  }
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
// Heure « HH:MM » (jour de la tâche, Bruxelles) ou instant ISO.
const when = z
  .string()
  .trim()
  .refine((v) => HHMM.test(v) || !Number.isNaN(Date.parse(v)), "Heure invalide (HH:MM).");

/**
 * Ligne encodée à la main, telle que rendue par le parseur du planificateur (`lib/planner/parse-task.ts`) : jamais de
 * nom ni de téléphone (le dossier suffit).
 */
const manualTaskSchema = z.object({
  kind: z.enum(["pmr_in", "pmr_out", "technique", "trajet", "autre"]),
  start: when,
  end: when.optional().or(z.literal("")),
  station: z.string().trim().max(80).default(""),
  other_station: z.string().trim().max(80).default(""),
  train: z.string().trim().max(20).default(""),
  pmr_type: z.enum(PMR_TASK_TYPES).or(z.literal("")).default(""),
  pax: z.number().int().min(0).max(50).default(0),
  light: z.boolean().default(false),
  dossier: z
    .string()
    .trim()
    .regex(/^(\d{4}-\d{2}-\d{2}-\d{4})?$/, "N° de dossier AAAA-MM-JJ-NNNN.")
    .default(""),
  label: z.string().trim().max(300).default(""),
});
export type ManualTaskInput = z.input<typeof manualTaskSchema>;

function instant(day: string, v: string): string {
  return HHMM.test(v) ? brusselsToUtc(day, v) : new Date(v).toISOString();
}

/** Crée des tâches encodées à la main pour le jour `day` (200 au plus). Renvoie leurs identifiants. */
export async function createManualTasks(
  day: string,
  lines: ManualTaskInput[],
): Promise<PlannerResult<{ created: number; ids: string[] }>> {
  try {
    await need("planner:write");
    if (!isValidDay(day)) throw new Refused("Jour invalide.");
    const rows = z.array(manualTaskSchema).min(1, "Aucune tâche.").max(200).parse(lines);
    const pb = await pbForRequest();
    const ids: string[] = [];
    for (const l of rows) {
      if ((l.kind === "pmr_in" || l.kind === "pmr_out") && !l.station)
        throw new Refused("Gare manquante pour une prise en charge PMR.");
      const start = instant(day, l.start);
      // Fin avant le début en « HH:MM » = lendemain (tâche de nuit).
      let end = l.end ? instant(day, l.end) : start;
      if (l.end && HHMM.test(l.end) && end < start) end = instant(addDays(day, 1), l.end);
      const r = await pb.collection("planner_tasks").create({
        day,
        kind: l.kind,
        start,
        end,
        station: l.station,
        station_key: stationKey(l.station),
        other_station: l.other_station,
        train: l.train,
        pmr_type: l.pmr_type,
        pax: l.pax,
        light: l.light,
        dossier: l.dossier,
        label: l.label,
        source: "manuel",
        status: "a_attribuer",
        origin: "manuel",
      });
      ids.push(r.id);
    }
    revalidatePath("/pmr/planificateur");
    return { ok: true, created: ids.length, ids };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Supprime une tâche : encodée à la main ou tirée d'un modèle avec `planner:write` ; venue de DICOS seulement avec
 * `planner:manage` (sinon elle reviendrait à la synchro suivante — l'annulation passe par DICOS).
 */
export async function deleteTask(id: string): Promise<PlannerResult> {
  try {
    const user = await need("planner:write");
    const pb = await pbForRequest();
    const cur = await pb
      .collection("planner_tasks")
      .getOne(pbId.parse(id), { fields: "id,source" });
    const dicos = cur.source !== "manuel" && cur.source !== "modele";
    if (dicos && !can(user, "planner:manage"))
      throw new Refused(
        "Une tâche venue de DICOS ne se supprime pas : elle suit le dossier DICOS.",
      );
    await pb.collection("planner_tasks").delete(cur.id);
    revalidatePath("/pmr/planificateur");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
