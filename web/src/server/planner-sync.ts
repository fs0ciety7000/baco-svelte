import "server-only";

import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";

import { brusselsDay, pbDate } from "@/lib/orders/time";
import {
  mapPendingDossier,
  nextPlannerStatus,
  pendingDossierRef,
  tasksFromAssist,
  unassistedKeys,
  type AssistForPlanner,
  type DicosTask,
  type PlannerStatus,
} from "@/lib/pmr/dicos-pending";

// Tâches du planificateur PMR alimentées par DICOS (15 oct. 2026, cadrage §7) : écrites avec le compte de service
// (`connector` + `dicos:write`) ; les règles PocketBase lui interdisent toute attribution, le serveur ne la touche pas.
//   - dossiers « à vérifier » (`POST /api/pmr/pending/ingest`) → tâches `dicos_pending` ;
//   - missions acceptées (fin de `POST /api/pmr/missions/ingest`) → `syncPlannerFromAssists` : la tâche en attente de
//     même clé (`<journeyId>:IN|OUT`) est RELIÉE à la mission (source `dicos_mission`, `assist`), sinon créée.
// Jamais de suppression : un bout disparu (assistance retirée d'une mission d'un lot complet, trajet retiré d'un dossier
// toujours « à vérifier ») passe la tâche en « annulée » en gardant l'agent ; un dossier disparu de la liste reste tel
// quel. Une tâche déjà attribuée dont la gare, l'heure ou le jour change est marquée `dicos_changed` (« Modifiée par
// DICOS », effacé par le hook quand un planificateur réattribue ou valide). Champs lus : jamais `note` ni `label`
// (saisis par les agents ; masqués aussi au compte de service par `planner.pb.js`).

export type PlannerSyncCounts = {
  received: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  /** Tâches passées « annulées » parce que leur bout a disparu de DICOS. */
  cancelled: number;
};

const empty = (): PlannerSyncCounts => ({
  received: 0,
  created: 0,
  updated: 0,
  unchanged: 0,
  skipped: 0,
  failed: 0,
  cancelled: 0,
});

/** Champs relus par la synchro (jamais `note` ni `label`). */
const TASK_FIELDS =
  "id,source,source_key,day,kind,start,end,station,station_key,other_station,train,pmr_type,pax,light,dossier," +
  "dicos_status,station_ok,assist,assignee_kind,status,dicos_changed";

const chunks = <T>(list: T[], n: number) =>
  Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

const sameInstant = (a: unknown, b: string) =>
  pbDate(typeof a === "string" ? a : "")?.getTime() === pbDate(b)?.getTime();

const isDicos = (r: RecordModel) => r.source === "dicos_pending" || r.source === "dicos_mission";

/** Tâches existantes par clé DICOS (paquets de 40). */
async function byKey(pb: PocketBase, keys: string[]): Promise<Map<string, RecordModel>> {
  const out = new Map<string, RecordModel>();
  const wanted = new Set(keys);
  for (const part of chunks([...wanted], 40)) {
    const filter = part
      .map((k, i) => pb.filter(`source_key = {:k${i}}`, { [`k${i}`]: k }))
      .join(" || ");
    for (const r of await pb
      .collection("planner_tasks")
      .getFullList({ filter, fields: TASK_FIELDS }))
      if (wanted.has(String(r.source_key))) out.set(String(r.source_key), r);
  }
  return out;
}

type Fields = Omit<DicosTask, "source_key">;

function diff(cur: RecordModel, next: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(next)) {
    const now = cur[k];
    if (k === "start" || k === "end") {
      if (!sameInstant(now, String(v))) patch[k] = v;
    } else if ((now ?? "") !== (v ?? "") && !(typeof v === "boolean" && !!now === v)) patch[k] = v;
  }
  return patch;
}

/** Gare, heure ou jour d'une tâche attribuée changés par la synchro : « Modifiée par DICOS ». */
const MOVED = ["station", "station_key", "start", "day"];

async function upsert(
  pb: PocketBase,
  tasks: (DicosTask & { assist?: string; cancelled?: boolean })[],
  source: "dicos_pending" | "dicos_mission",
  c: PlannerSyncCounts,
  syncedBy = "",
) {
  const existing = await byKey(
    pb,
    tasks.map((t) => t.source_key),
  );
  const by = syncedBy ? { synced_by: syncedBy } : {};
  for (const t of tasks) {
    c.received++;
    const { source_key, assist, cancelled: _c, ...rest } = t;
    void _c;
    const fields: Fields & { assist?: string } = { ...rest, ...(assist ? { assist } : {}) };
    const cancelled = t.dicos_status === "cancelled";
    const cur = existing.get(source_key);
    try {
      if (!cur) {
        // Annulé avant même d'avoir été vu : rien à planifier.
        if (cancelled) {
          c.skipped++;
          continue;
        }
        await pb.collection("planner_tasks").create({
          ...fields,
          ...by,
          source_key,
          source,
          status: "a_attribuer",
        });
        c.created++;
        continue;
      }
      // Tâche encodée à la main ou reliée à sa mission : la liste « à vérifier » ne la réécrit plus.
      if (!isDicos(cur)) {
        c.skipped++;
        continue;
      }
      if (source === "dicos_pending" && cur.source === "dicos_mission") {
        c.unchanged++;
        continue;
      }
      const assigned = !!cur.assignee_kind;
      const status = nextPlannerStatus(cur.status as PlannerStatus, cancelled, assigned);
      const patch = diff(cur, {
        ...fields,
        ...(cur.source !== source ? { source } : {}),
        status,
      });
      if (!Object.keys(patch).length) {
        c.unchanged++;
        continue;
      }
      if (assigned && !cancelled && MOVED.some((k) => k in patch)) patch.dicos_changed = true;
      await pb.collection("planner_tasks").update(cur.id, { ...patch, ...by });
      c.updated++;
    } catch {
      c.failed++;
    }
  }
}

/** Passe « annulées » (agent gardé, « faite » reste faite) les tâches DICOS de ces clés encore actives. */
async function cancelKeys(
  pb: PocketBase,
  keys: string[],
  c: PlannerSyncCounts,
  syncedBy = "",
  existing?: Map<string, RecordModel>,
) {
  const rows = existing ?? (keys.length ? await byKey(pb, keys) : new Map<string, RecordModel>());
  for (const k of keys) {
    const cur = rows.get(k);
    if (!cur || !isDicos(cur) || cur.status === "annulee" || cur.status === "faite") continue;
    try {
      await pb.collection("planner_tasks").update(cur.id, {
        dicos_status: "cancelled",
        status: nextPlannerStatus(cur.status as PlannerStatus, true, !!cur.assignee_kind),
        ...(syncedBy ? { synced_by: syncedBy } : {}),
      });
      c.cancelled++;
    } catch {
      c.failed++;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Plafonds des dossiers en attente (audit sécurité du 15 oct. 2026)

/** Tâches au plus par requête et par jeton et par jour (Bruxelles). */
export const PENDING_LIMITS = { perRequest: 2000, perDay: 6000 } as const;

const quota = globalThis as unknown as {
  __csmPendingQuota?: Map<string, { day: string; n: number }>;
};

/** Nombre de tâches qu'un lot de dossiers produirait (avant les bornes de jours). */
export function countPendingTasks(dossiers: unknown[]): number {
  let n = 0;
  for (const d of dossiers) n += mapPendingDossier(d).length;
  return n;
}

/**
 * Réserve `n` tâches pour le jeton `who` (compteur en mémoire, remis à zéro chaque jour à Bruxelles). Faux (rien
 * réservé) si le lot dépasse le plafond par requête ou le plafond du jour.
 */
export function reservePendingQuota(who: string, n: number, day = brusselsDay()): boolean {
  if (n > PENDING_LIMITS.perRequest) return false;
  const m = (quota.__csmPendingQuota ??= new Map());
  const cur = m.get(who);
  const used = cur && cur.day === day ? cur.n : 0;
  if (used + n > PENDING_LIMITS.perDay) return false;
  m.set(who, { day, n: used + n });
  if (m.size > 500) for (const [k, v] of m) if (v.day !== day) m.delete(k);
  return true;
}

/**
 * Dossiers « à vérifier » reçus de l'extension → tâches `dicos_pending` (upsert idempotent par clé `<journeyId>:IN|OUT`).
 * `inRange(day)` borne les jours acceptés (un lot forgé ne réécrit ni l'historique ni l'avenir lointain). Un trajet qui
 * a disparu d'un dossier toujours présent (ou dont le bout n'est plus assisté) → tâche « annulée ». `syncedBy` :
 * propriétaire du jeton personnel qui a envoyé le lot ("" pour le secret partagé).
 */
export async function ingestPending(
  pb: PocketBase,
  dossiers: unknown[],
  inRange: (day: string) => boolean,
  syncedBy = "",
): Promise<PlannerSyncCounts & { dossiers: number }> {
  const c = empty();
  const tasks: DicosTask[] = [];
  const seen = new Set<string>();
  const refs = new Set<string>();
  for (const raw of dossiers) {
    const ref = pendingDossierRef(raw);
    if (ref) refs.add(ref);
    for (const t of mapPendingDossier(raw)) {
      // Clé vue (même hors des jours acceptés) : jamais prise pour un trajet disparu.
      const first = !seen.has(t.source_key);
      seen.add(t.source_key);
      if (!inRange(t.day)) {
        c.skipped++;
        continue;
      }
      // Même trajet dans deux dossiers (impossible en principe) : le premier l'emporte.
      if (first) tasks.push(t);
    }
  }
  await upsert(pb, tasks, "dicos_pending", c, syncedBy);

  // Trajets disparus des dossiers reçus (paquets de 30 dossiers).
  for (const part of chunks([...refs], 30)) {
    try {
      const filter =
        `source = "dicos_pending" && status != "annulee" && status != "faite" && (` +
        part.map((d, i) => pb.filter(`dossier = {:d${i}}`, { [`d${i}`]: d })).join(" || ") +
        ")";
      const rows = await pb
        .collection("planner_tasks")
        .getFullList({ filter, fields: TASK_FIELDS });
      const gone = new Map<string, RecordModel>();
      for (const r of rows) {
        const k = String(r.source_key ?? "");
        if (!k || seen.has(k) || r.source !== "dicos_pending" || !part.includes(String(r.dossier)))
          continue;
        if (!inRange(String(r.day))) continue;
        gone.set(k, r);
      }
      await cancelKeys(pb, [...gone.keys()], c, syncedBy, gone);
    } catch {
      c.failed++;
    }
  }
  return { ...c, dossiers: dossiers.length };
}

const ASSIST_FIELDS =
  "id,dicos_id,day,time,arr_time,station,other_station,in_assist,out_assist,train,transport,pmr_type,pax," +
  "full_pax,light_pax,dicos_ref,status,in_status,out_status,anonymized";

function asAssist(r: RecordModel): AssistForPlanner {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    id: r.id,
    dicos_id: s(r.dicos_id),
    day: s(r.day),
    time: s(r.time),
    arr_time: s(r.arr_time),
    station: s(r.station),
    other_station: s(r.other_station),
    in_assist: !!r.in_assist,
    out_assist: !!r.out_assist,
    train: s(r.train),
    transport: s(r.transport),
    pmr_type: s(r.pmr_type),
    pax: n(r.pax),
    full_pax: n(r.full_pax),
    light_pax: n(r.light_pax),
    dicos_ref: s(r.dicos_ref),
    status: s(r.status),
    in_status: s(r.in_status),
    out_status: s(r.out_status),
  };
}

/**
 * Missions acceptées du jour `day` (`pmr_assists`, une ligne par trajet `j<journeyId>`) → tâches du planificateur :
 * tâche en attente reliée (source `dicos_mission`, statut DICOS `accepted`, `assist` = la mission), sinon créée.
 * L'attribution n'est jamais touchée ; une mission annulée passe la tâche en « annulée » en gardant l'agent.
 * `onlyDicosIds` : seulement ces missions (lot qui vient d'être ingéré). `complete` (lot final sans erreur) : un bout
 * dont l'assistance a disparu (`in_assist` / `out_assist` faux) annule la tâche de même clé. Ne lève pas : `failed`.
 */
export async function syncPlannerFromAssists(
  pb: PocketBase,
  day: string,
  onlyDicosIds?: readonly string[],
  opts: { complete?: boolean; syncedBy?: string } = {},
): Promise<PlannerSyncCounts> {
  const c = empty();
  let rows: RecordModel[];
  try {
    rows = await pb.collection("pmr_assists").getFullList({
      filter: pb.filter("day = {:d} && dicos_id ~ 'j%' && anonymized != true", { d: day }),
      fields: ASSIST_FIELDS,
      batch: 500,
    });
  } catch {
    c.failed++;
    return c;
  }
  const only = onlyDicosIds ? new Set(onlyDicosIds) : null;
  const lot = rows.filter((r) => !only || only.has(String(r.dicos_id)));
  const tasks = lot.flatMap((r) =>
    tasksFromAssist(asAssist(r)).map((t) => ({ ...t, assist: r.id })),
  );
  try {
    await upsert(pb, tasks, "dicos_mission", c, opts.syncedBy);
    if (opts.complete) {
      const gone = lot.flatMap((r) => unassistedKeys(asAssist(r)));
      await cancelKeys(pb, gone, c, opts.syncedBy);
    }
  } catch {
    c.failed++;
  }
  return c;
}
