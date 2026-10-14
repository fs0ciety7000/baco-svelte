import "server-only";

import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";

import { pbDate } from "@/lib/orders/time";
import {
  isTeamAccount,
  mapQuinyxBatch,
  removalAllowed,
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
  /** Retrait des prestations disparues refusé (lot partiel suspect) : à revoir dans Administration › Quinyx. */
  removalSkipped: boolean;
  /** Prestations écartées : agent sans compte PACO/RCCA dans CSM (ni rattaché, ni proposé). */
  notTeam: number;
  agents: number;
  failed: number;
};

// Un seul lot à la fois par groupe (deux agents qui synchronisent en même temps), registre partagé entre les copies
// du module (route et actions).
const running: Set<string> = ((
  globalThis as { __csmQuinyxRunning?: Set<string> }
).__csmQuinyxRunning ??= new Set());

/** Écrit un lot (un groupe, une période). `complete` : retire les prestations de la période disparues de Quinyx. */
export async function ingestQuinyx(
  pb: PocketBase,
  batch: QuinyxBatch,
  who: ConnectorAuth,
  version: string,
): Promise<IngestCounts | { error: string; status: number }> {
  if (running.has(batch.group))
    return { error: "Synchro de ce groupe déjà en cours, réessaie dans une minute.", status: 409 };
  running.add(batch.group);
  try {
    return await ingestGroup(pb, batch, who, version);
  } finally {
    running.delete(batch.group);
  }
}

async function ingestGroup(
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
    removalSkipped: false,
    notTeam: 0,
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
  // Comptes de l'équipe (PACO/RCCA, modérateurs, admins) : seuls candidats à la proposition, et seuls dont les
  // horaires sont gardés.
  const team = (
    await pb.collection("users").getFullList({
      fields: "id,name,role",
      filter: 'role != "disabled" && role != "connector" && role != "screen" && role != "guest"',
    })
  )
    .filter((u) => isTeamAccount(u.role))
    .map((u) => ({ id: u.id, name: String(u.name ?? "") }));
  const teamIds = new Set(team.map((u) => u.id));
  const users = team;
  /** Agents Quinyx reconnus comme membres de l'équipe CSM (rattachés, sinon proposés). */
  const teamAgents = new Set<string>();
  const now = new Date().toISOString();
  for (const a of mapped.agents) {
    const r = existing.get(a.quinyx_id);
    const groups = [...new Set([...((r?.groups as string[] | null) ?? []), batch.group])].slice(
      -20,
    );
    const suggestion = !r || (!r.user && !r.confirmed) ? suggestUser(a, users) : undefined;
    const account = r?.confirmed
      ? String(r.user ?? "")
      : (suggestion ?? String(r?.user_suggested ?? ""));
    if (account && teamIds.has(account)) teamAgents.add(a.quinyx_id);
    try {
      if (!r) {
        const n = await pb
          .collection("quinyx_agents")
          .create({ ...a, groups, last_seen: now, user_suggested: suggestion || "" })
          .catch(async (e) => {
            // Créé entre-temps par une autre synchro : on reprend la fiche existante.
            const again = await pb
              .collection("quinyx_agents")
              .getFirstListItem(pb.filter("quinyx_id = {:q}", { q: a.quinyx_id }))
              .catch(() => null);
            if (!again) throw e;
            return again;
          });
        agentIds.set(a.quinyx_id, n.id);
        c.agents++;
      } else {
        // Noms vides (agent absent de la liste du groupe) : on garde ceux déjà connus. Agent rattaché : nom figé (un
        // lot forgé ne peut pas le renommer pour détourner la proposition de compte).
        const patch: Record<string, unknown> = { last_seen: now, groups };
        if ((a.first_name || a.last_name) && !r.confirmed) {
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
    expand: "agent",
  });
  const byId = new Map(stored.map((r) => [String(r.quinyx_id), r]));
  // Prestations déplacées hors de la période lue : retrouvées par paquets, dans CE groupe seulement.
  const missing = mapped.shifts.map((s) => s.quinyx_id).filter((q) => !byId.has(q));
  for (const part of chunks(missing, 40))
    for (const r of await pb.collection("quinyx_shifts").getFullList({
      filter: `${pb.filter("group_id = {:g}", { g: batch.group })} && (${orFilter(pb, "quinyx_id", part)})`,
    }))
      byId.set(String(r.quinyx_id), r);
  const seen = new Set<string>();
  for (const s of mapped.shifts) {
    // Horaires gardés seulement pour les agents qui ont un compte PACO/RCCA dans CSM (les autres : nom seul, pour que
    // l'admin puisse les rattacher à la main ; une prestation déjà stockée disparaît comme une prestation retirée).
    if (!teamAgents.has(s.employee)) {
      c.notTeam++;
      continue;
    }
    const agent = agentIds.get(s.employee);
    if (!agent) {
      c.failed++;
      continue;
    }
    seen.add(s.quinyx_id);
    const rec = shiftRecord(s, agent);
    try {
      const cur = byId.get(s.quinyx_id) ?? null;
      if (!cur) {
        try {
          await pb.collection("quinyx_shifts").create({ quinyx_id: s.quinyx_id, ...rec });
          c.created++;
        } catch (e) {
          // Créée entre-temps (autre groupe qui porte la même prestation) : relue et mise à jour dans ce groupe.
          const again = await pb
            .collection("quinyx_shifts")
            .getFirstListItem(pb.filter("quinyx_id = {:q}", { q: s.quinyx_id }))
            .catch(() => null);
          if (!again) throw e;
          await pb.collection("quinyx_shifts").update(again.id, rec);
          c.updated++;
        }
      } else if (changed(cur, rec)) {
        await pb.collection("quinyx_shifts").update(cur.id, rec);
        c.updated++;
      } else c.unchanged++;
    } catch {
      c.failed++;
    }
  }

  c.kept = mapped.shifts.length - c.notTeam;

  // --- Prestations disparues (désaffectées, supprimées, changées en repos) : retirées sur un lot complet ---
  // Seulement dans les sections reçues (un agent qui ne voit qu'une section n'efface pas les autres), et jamais plus de
  // 30 % de la période d'un coup (accès Quinyx réduit, lot tronqué ou forgé : rien n'est retiré, l'admin le voit).
  // Et seulement pour les agents que ce compte Quinyx voit (`visible`) : sans liste, rien n'est retiré.
  const sections = new Set(["", ...batch.sections.map((s) => s.name.trim())]);
  const visible = new Set(batch.visible ?? []);
  const qidOf = (r: RecordModel) =>
    String((r.expand?.agent as RecordModel | undefined)?.quinyx_id ?? "");
  // Prestations d'un agent évalué dans ce lot mais hors équipe CSM (compte détaché, rôle changé) : retirées sans
  // plafond, ce ne sont pas des disparitions.
  const judged = new Set(mapped.agents.map((a) => a.quinyx_id));
  const excluded = stored.filter((r) => judged.has(qidOf(r)) && !teamAgents.has(qidOf(r)));
  const excludedIds = new Set(excluded.map((r) => r.id));
  const gone = stored.filter(
    (r) =>
      !excludedIds.has(r.id) &&
      !seen.has(String(r.quinyx_id)) &&
      sections.has(String(r.section ?? "")) &&
      visible.has(qidOf(r)),
  );
  const capped = gone.length > 0 && !removalAllowed(stored.length - excluded.length, gone.length);
  if (batch.complete && !c.failed && capped) c.removalSkipped = true;
  if (batch.complete && !c.failed) {
    for (const r of [...excluded, ...(capped ? [] : gone)]) {
      try {
        await pb.collection("quinyx_shifts").delete(r.id);
        c.removed++;
      } catch {
        c.failed++;
      }
    }
  }

  // Fraîcheur posée seulement sur une synchro sans erreur (sinon « synchronisé il y a 2 min » mentirait).
  if (c.failed) return c;
  await pb
    .collection("quinyx_groups")
    .update(group.id, {
      last_sync: now,
      last_from: batch.from,
      last_to: end,
      last_count: c.kept,
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
