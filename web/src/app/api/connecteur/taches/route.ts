import { z } from "zod";

import {
  claimLease,
  freeTasks,
  LEASE_MINUTES,
  OUTCOME_CODES,
  POLL_MINUTES,
  releaseLease,
} from "@/lib/connector/tasks";
import { currentTasks, registry } from "@/server/connector-tasks";
import { connectorRequest } from "@/server/quinyx-ingest";

// Synchro automatique (extension ≥ 1.13.0, 4 nov. 2026) : l'extension de n'importe quel agent connecté demande toutes les
// 5 min ce qu'il faut synchroniser (GET), réserve une tâche (POST claim : un seul poste à la fois, bail de 10 min), la lance
// dans son onglet DICOS ou Quinyx ouvert, puis rapporte le résultat (POST done : code seulement, aucune donnée). Même
// authentification que l'ingestion (jeton de connecteur personnel ou secret partagé, compte de service).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const holderOf = (who: { kind: string; tokenId?: string }) =>
  who.kind === "personal" && who.tokenId ? `t:${who.tokenId}` : "shared";

export async function GET(request: Request) {
  const r = await connectorRequest(request, "connector-tasks", 30);
  if (r instanceof Response) return r;
  const now = new Date();
  let tasks;
  try {
    tasks = await currentTasks(r.pb, now);
  } catch {
    return Response.json({ error: "Lecture des synchros impossible." }, { status: 502 });
  }
  const holder = holderOf(r.who);
  return Response.json(
    {
      tasks: freeTasks(tasks, registry.leases, holder, now.getTime()),
      waiting: tasks.length,
      poll: POLL_MINUTES,
      lease: LEASE_MINUTES,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

const taskId = z.string().regex(/^(dicos:\d{4}-\d{2}-\d{2}|quinyx)$/);
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim"), id: taskId }),
  z.object({
    action: z.literal("done"),
    id: taskId,
    ok: z.boolean(),
    code: z.enum(OUTCOME_CODES).catch("error"),
  }),
]);

export async function POST(request: Request) {
  const len = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(len) && len > 2000)
    return Response.json({ error: "Corps trop volumineux." }, { status: 413 });
  const r = await connectorRequest(request, "connector-tasks", 30);
  if (r instanceof Response) return r;
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(JSON.parse((await request.text()).slice(0, 2000)));
  } catch {
    return Response.json({ error: "Corps invalide." }, { status: 400 });
  }
  const holder = holderOf(r.who);
  const now = Date.now();
  if (body.action === "claim") {
    // Une tâche réservée doit encore être à faire (une autre synchro, manuelle, a pu passer entre-temps).
    let tasks;
    try {
      tasks = await currentTasks(r.pb, new Date(now));
    } catch {
      return Response.json({ error: "Lecture des synchros impossible." }, { status: 502 });
    }
    const task = tasks.find((t) => t.id === body.id);
    if (!task) return Response.json({ granted: false, reason: "done" });
    const granted = claimLease(registry.leases, body.id, holder, now);
    return Response.json({ granted, task: granted ? task : undefined });
  }
  releaseLease(registry.leases, body.id, holder);
  const kind = body.id === "quinyx" ? "quinyx" : "dicos";
  // « Pas d'onglet ouvert sur ce poste » n'efface pas un succès récent d'un autre poste (15 min).
  const prev = registry.last[kind];
  if (!body.ok && body.code.startsWith("no-") && prev?.ok && now - prev.at < 15 * 60_000)
    return Response.json({ ok: true });
  registry.last[kind] = {
    id: body.id,
    kind,
    ok: body.ok,
    code: body.ok ? "ok" : body.code,
    at: now,
    by: r.who.kind === "personal" ? r.who.userId : "",
    version: r.version,
  };
  return Response.json({ ok: true });
}
