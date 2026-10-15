import "server-only";

import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";

import { pbDate } from "@/lib/orders/time";
import {
  mapPendingDossier,
  nextPlannerStatus,
  tasksFromAssist,
  type AssistForPlanner,
  type DicosTask,
  type PlannerStatus,
} from "@/lib/pmr/dicos-pending";

// Tâches du planificateur PMR alimentées par DICOS (15 oct. 2026, cadrage §7) : écrites avec le compte de service
// (`connector` + `dicos:write`) ; les règles PocketBase lui interdisent toute attribution, le serveur ne la touche pas.
//   - dossiers « à vérifier » (`POST /api/pmr/pending/ingest`) → tâches `dicos_pending` ;
//   - missions acceptées (fin de `POST /api/pmr/missions/ingest`) → `syncPlannerFromAssists` : la tâche en attente de
//     même clé (`<journeyId>:IN|OUT`) est RELIÉE à la mission (source `dicos_mission`, `assist`), sinon créée.
// Jamais de suppression : un dossier disparu de la liste « à vérifier » reste tel quel.

export type PlannerSyncCounts = {
  received: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
};

const empty = (): PlannerSyncCounts => ({
  received: 0,
  created: 0,
  updated: 0,
  unchanged: 0,
  skipped: 0,
  failed: 0,
});

const chunks = <T>(list: T[], n: number) =>
  Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

const sameInstant = (a: unknown, b: string) =>
  pbDate(typeof a === "string" ? a : "")?.getTime() === pbDate(b)?.getTime();

/** Tâches existantes par clé DICOS (paquets de 40). */
async function byKey(pb: PocketBase, keys: string[]): Promise<Map<string, RecordModel>> {
  const out = new Map<string, RecordModel>();
  for (const part of chunks([...new Set(keys)], 40)) {
    const filter = part
      .map((k, i) => pb.filter(`source_key = {:k${i}}`, { [`k${i}`]: k }))
      .join(" || ");
    for (const r of await pb.collection("planner_tasks").getFullList({ filter }))
      out.set(String(r.source_key), r);
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

async function upsert(
  pb: PocketBase,
  tasks: (DicosTask & { assist?: string; cancelled?: boolean })[],
  source: "dicos_pending" | "dicos_mission",
  c: PlannerSyncCounts,
) {
  const existing = await byKey(
    pb,
    tasks.map((t) => t.source_key),
  );
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
          source_key,
          source,
          status: "a_attribuer",
        });
        c.created++;
        continue;
      }
      // Tâche encodée à la main ou reliée à sa mission : la liste « à vérifier » ne la réécrit plus.
      const curSource = String(cur.source ?? "");
      if (curSource === "manuel" || curSource === "modele") {
        c.skipped++;
        continue;
      }
      if (source === "dicos_pending" && curSource === "dicos_mission") {
        c.unchanged++;
        continue;
      }
      const assigned = !!cur.assignee_kind;
      const status = nextPlannerStatus(cur.status as PlannerStatus, cancelled, assigned);
      const patch = diff(cur, {
        ...fields,
        ...(curSource !== source ? { source } : {}),
        status,
      });
      if (!Object.keys(patch).length) {
        c.unchanged++;
        continue;
      }
      await pb.collection("planner_tasks").update(cur.id, patch);
      c.updated++;
    } catch {
      c.failed++;
    }
  }
}

/**
 * Dossiers « à vérifier » reçus de l'extension → tâches `dicos_pending` (upsert idempotent par clé `<journeyId>:IN|OUT`).
 * `inRange(day)` borne les jours acceptés (un lot forgé ne réécrit ni l'historique ni l'avenir lointain).
 */
export async function ingestPending(
  pb: PocketBase,
  dossiers: unknown[],
  inRange: (day: string) => boolean,
): Promise<PlannerSyncCounts & { dossiers: number }> {
  const c = empty();
  const tasks: DicosTask[] = [];
  const seen = new Set<string>();
  for (const raw of dossiers) {
    for (const t of mapPendingDossier(raw)) {
      if (!inRange(t.day)) {
        c.skipped++;
        continue;
      }
      // Même trajet dans deux dossiers (impossible en principe) : le premier l'emporte.
      if (seen.has(t.source_key)) continue;
      seen.add(t.source_key);
      tasks.push(t);
    }
  }
  await upsert(pb, tasks, "dicos_pending", c);
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
 * `onlyDicosIds` : seulement ces missions (lot qui vient d'être ingéré). Ne lève pas : compteurs `failed`.
 */
export async function syncPlannerFromAssists(
  pb: PocketBase,
  day: string,
  onlyDicosIds?: readonly string[],
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
  const tasks = rows
    .filter((r) => !only || only.has(String(r.dicos_id)))
    .flatMap((r) => tasksFromAssist(asAssist(r)).map((t) => ({ ...t, assist: r.id })));
  try {
    await upsert(pb, tasks, "dicos_mission", c);
  } catch {
    c.failed++;
  }
  return c;
}
