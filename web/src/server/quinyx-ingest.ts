import "server-only";

import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";

import { pbDate } from "@/lib/orders/time";
import {
  mapQuinyxBatch,
  suggestUser,
  type MappedShift,
  type Place,
  type QuinyxBatch,
} from "@/lib/quinyx/model";
import {
  ConnectorRateLimited,
  authenticateConnector,
  extensionVersion,
  ingestConfigured,
  serviceAuth,
  type ConnectorAuth,
} from "@/server/dicos-service";
import { createPb } from "@/server/pocketbase";
import { allow } from "@/server/rate-limit";

// Horaires Quinyx (14 oct. 2026) : même authentification que l'ingestion DICOS (jeton de connecteur personnel ou
// secret partagé, compte de service `connector`). Le serveur trie et convertit (lib/quinyx/model.ts) ; l'extension
// n'envoie que les champs utiles.

const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Authentifie l'extension (jeton) et ouvre le compte de service. Renvoie une réponse d'erreur sinon. */
export async function connectorRequest(
  request: Request,
  bucket: string,
  max: number,
): Promise<{ who: ConnectorAuth; pb: PocketBase; version: string } | Response> {
  if (!ingestConfigured()) return json({ error: "Ingestion non configurée." }, 503);
  const version = extensionVersion(request);
  let who: ConnectorAuth | null;
  try {
    who = await authenticateConnector(request.headers.get("x-dicos-token") ?? "", version);
  } catch (e) {
    if (e instanceof ConnectorRateLimited)
      return json({ error: "Trop de requêtes, réessaie plus tard." }, 429);
    return json({ error: "Compte de service indisponible." }, 502);
  }
  if (!who) return json({ error: "Jeton de connecteur invalide." }, 401);
  if (!allow(`${bucket}:${who.kind === "personal" ? who.tokenId : "shared"}`, max, 60_000))
    return json({ error: "Trop de requêtes, réessaie plus tard." }, 429);
  try {
    const svc = await serviceAuth();
    return { who, pb: createPb(svc.token), version };
  } catch {
    return json({ error: "Compte de service indisponible." }, 502);
  }
}

export type QuinyxGroupConfig = { group: string; label: string };

/** Groupes Quinyx à lire (activés par un admin). */
export async function enabledGroups(pb: PocketBase): Promise<QuinyxGroupConfig[]> {
  const rows = await pb
    .collection("quinyx_groups")
    .getFullList({ filter: "enabled = true", fields: "group_id,label", sort: "label" });
  return rows.map((r) => ({ group: String(r.group_id), label: String(r.label) }));
}

const chunks = <T>(list: T[], n: number) =>
  Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

const orFilter = (pb: PocketBase, field: string, values: string[]) =>
  values.map((v, i) => pb.filter(`${field} = {:v${i}}`, { [`v${i}`]: v })).join(" || ");

const same = (a: string, b: string) => pbDate(a)?.getTime() === pbDate(b)?.getTime();

export type IngestCounts = {
  received: number;
  kept: number;
  ignored: number;
  created: number;
  updated: number;
  unchanged: number;
  removed: number;
  agents: number;
  failed: number;
};

/** Écrit un lot (un groupe, une période). `complete` : retire les prestations de la période disparues de Quinyx. */
export async function ingestQuinyx(
  pb: PocketBase,
  batch: QuinyxBatch,
  who: ConnectorAuth,
  version: string,
): Promise<IngestCounts | { error: string; status: number }> {
  const group = await pb
    .collection("quinyx_groups")
    .getFirstListItem(pb.filter("group_id = {:g}", { g: batch.group }))
    .catch(() => null);
  if (!group || !group.enabled)
    return {
      error: "Groupe Quinyx non configuré dans CSM (Administration › Quinyx).",
      status: 404,
    };
  const places = (
    await pb.collection("quinyx_places").getFullList({ fields: "pattern,district" })
  ).map((p) => ({ pattern: String(p.pattern), district: String(p.district) })) as Place[];
  const mapped = mapQuinyxBatch(batch, places, String(group.district ?? ""));
  const c: IngestCounts = {
    received: batch.shifts.length,
    kept: mapped.shifts.length,
    ignored: mapped.ignored,
    created: 0,
    updated: 0,
    unchanged: 0,
    removed: 0,
    agents: 0,
    failed: 0,
  };

  // --- Agents : créés à la première prestation, nom tenu à jour, compte CSM proposé par le nom ---
  const agentIds = new Map<string, string>();
  const existing = new Map<string, RecordModel>();
  for (const part of chunks(
    mapped.agents.map((a) => a.quinyx_id),
    40,
  )) {
    for (const r of await pb
      .collection("quinyx_agents")
      .getFullList({ filter: orFilter(pb, "quinyx_id", part) }))
      existing.set(String(r.quinyx_id), r);
  }
  const needUsers = mapped.agents.some((a) => {
    const r = existing.get(a.quinyx_id);
    return !r || (!r.user && !r.confirmed);
  });
  const users = needUsers
    ? (
        await pb
          .collection("users")
          .getFullList({
            fields: "id,name,role",
            filter: 'role != "disabled" && role != "connector" && role != "screen"',
          })
      ).map((u) => ({ id: u.id, name: String(u.name ?? "") }))
    : [];
  const now = new Date().toISOString();
  for (const a of mapped.agents) {
    const r = existing.get(a.quinyx_id);
    const groups = [...new Set([...((r?.groups as string[] | null) ?? []), batch.group])].slice(
      -20,
    );
    const suggestion = !r || (!r.user && !r.confirmed) ? suggestUser(a, users) : undefined;
    try {
      if (!r) {
        const n = await pb.collection("quinyx_agents").create({
          ...a,
          groups,
          last_seen: now,
          user_suggested: suggestion || "",
        });
        agentIds.set(a.quinyx_id, n.id);
        c.agents++;
      } else {
        // Noms vides (agent absent de la liste du groupe) : on garde ceux déjà connus.
        const patch: Record<string, unknown> = { last_seen: now, groups };
        if (a.first_name || a.last_name) {
          patch.first_name = a.first_name;
          patch.last_name = a.last_name;
        }
        if (suggestion !== undefined) patch.user_suggested = suggestion;
        await pb.collection("quinyx_agents").update(r.id, patch);
        agentIds.set(a.quinyx_id, r.id);
      }
    } catch {
      c.failed++;
    }
  }

  // --- Prestations : upsert par identifiant Quinyx ---
  const end = batch.to < batch.publishedUntil ? batch.to : prevDay(batch.publishedUntil);
  const stored = await pb.collection("quinyx_shifts").getFullList({
    filter: pb.filter("group_id = {:g} && day >= {:f} && day <= {:t}", {
      g: batch.group,
      f: batch.from,
      t: end,
    }),
  });
  const byId = new Map(stored.map((r) => [String(r.quinyx_id), r]));
  const seen = new Set<string>();
  for (const s of mapped.shifts) {
    const agent = agentIds.get(s.employee);
    if (!agent) {
      c.failed++;
      continue;
    }
    seen.add(s.quinyx_id);
    const rec = shiftRecord(s, agent);
    try {
      let cur = byId.get(s.quinyx_id) ?? null;
      // Prestation déplacée hors de la période lue : retrouvée par son identifiant.
      if (!cur)
        cur = await pb
          .collection("quinyx_shifts")
          .getFirstListItem(pb.filter("quinyx_id = {:q}", { q: s.quinyx_id }))
          .catch(() => null);
      if (!cur) {
        await pb.collection("quinyx_shifts").create({ quinyx_id: s.quinyx_id, ...rec });
        c.created++;
      } else if (changed(cur, rec)) {
        await pb.collection("quinyx_shifts").update(cur.id, rec);
        c.updated++;
      } else c.unchanged++;
    } catch {
      c.failed++;
    }
  }

  // --- Prestations disparues (désaffectées, supprimées, changées en repos) : retirées sur un lot complet ---
  // Garde-fou : un lot complet sans aucune prestation alors que CSM en a beaucoup = accès Quinyx réduit, pas un
  // planning vidé ; rien n'est retiré.
  if (batch.complete && !c.failed && !(mapped.shifts.length === 0 && stored.length > 10)) {
    for (const r of stored) {
      if (seen.has(String(r.quinyx_id))) continue;
      try {
        await pb.collection("quinyx_shifts").delete(r.id);
        c.removed++;
      } catch {
        c.failed++;
      }
    }
  }

  await pb
    .collection("quinyx_groups")
    .update(group.id, {
      last_sync: now,
      last_from: batch.from,
      last_to: end,
      last_count: mapped.shifts.length,
      last_by: who.kind === "personal" ? who.userId : "",
      last_version: version,
    })
    .catch(() => null);
  return c;
}

function prevDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function shiftRecord(s: MappedShift, agent: string) {
  return {
    group_id: s.group_id,
    agent,
    day: s.day,
    start: s.start,
    end: s.end,
    code: s.code,
    section: s.section,
    kind: s.kind,
    district: s.district,
  };
}

function changed(cur: RecordModel, rec: ReturnType<typeof shiftRecord>): boolean {
  return (
    cur.agent !== rec.agent ||
    cur.day !== rec.day ||
    cur.group_id !== rec.group_id ||
    !same(String(cur.start), rec.start) ||
    !same(String(cur.end), rec.end) ||
    cur.code !== rec.code ||
    (cur.section ?? "") !== rec.section ||
    cur.kind !== rec.kind ||
    (cur.district ?? "") !== rec.district
  );
}
