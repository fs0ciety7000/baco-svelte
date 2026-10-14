import "server-only";

import type { RecordModel } from "pocketbase";
import { cache } from "react";

import { addDays, brusselsDay, pbDate } from "@/lib/orders/time";
import { agentName, type QuinyxKind } from "@/lib/quinyx/model";

import { pbForRequest } from "./orders";

// Planning Quinyx (Équipe › Planning, Administration › Quinyx ; 14 oct. 2026). Lecture avec le jeton de l'agent : les
// règles PocketBase (`1760004200`) excluent l'invité et l'Écran. Seuls les champs affichés quittent le serveur.

const str = (v: unknown) => (typeof v === "string" ? v : "");
const iso = (v: unknown) => pbDate(str(v))?.toISOString() ?? "";

export type PlanningShift = {
  id: string;
  day: string;
  start: string;
  end: string;
  code: string;
  section: string;
  kind: QuinyxKind;
  district: string;
  agentId: string;
  /** Compte CSM rattaché (vide sinon). */
  userId: string;
  name: string;
  avatar: string;
  role: string;
};

function planningShift(r: RecordModel): PlanningShift {
  const agent = (r.expand?.agent ?? {}) as RecordModel;
  const user = (agent.expand?.user ?? null) as RecordModel | null;
  return {
    id: r.id,
    day: str(r.day),
    start: iso(r.start),
    end: iso(r.end),
    code: str(r.code),
    section: str(r.section),
    kind: (str(r.kind) || "autre") as QuinyxKind,
    district: str(r.district),
    agentId: str(agent.id),
    userId: user ? user.id : "",
    name: user ? str(user.name) || str(user.username) || agentName(agent) : agentName(agent),
    avatar: user ? str(user.avatar) : "",
    role: user ? str(user.role) : "",
  };
}

const SHIFT_FIELDS =
  "id,day,start,end,code,section,kind,district,expand.agent.id,expand.agent.first_name,expand.agent.last_name," +
  "expand.agent.expand.user.id,expand.agent.expand.user.name,expand.agent.expand.user.username," +
  "expand.agent.expand.user.avatar,expand.agent.expand.user.role";

/** Prestations du jour `from` au jour `to` (inclus), triées par début. */
export async function listPlanning(
  from: string,
  to: string,
  district = "",
): Promise<PlanningShift[]> {
  const pb = await pbForRequest();
  const filter = [pb.filter("day >= {:f} && day <= {:t}", { f: from, t: to })];
  if (district) filter.push(pb.filter("district = {:d}", { d: district }));
  const rows = await pb.collection("quinyx_shifts").getFullList({
    filter: filter.join(" && "),
    sort: "start,code",
    expand: "agent,agent.user",
    fields: SHIFT_FIELDS,
    batch: 500,
  });
  return rows.map(planningShift);
}

/** Prestations d'un compte CSM (rattachement validé) entre deux jours. */
export async function myShifts(userId: string, from: string, to: string): Promise<PlanningShift[]> {
  const pb = await pbForRequest();
  const rows = await pb.collection("quinyx_shifts").getFullList({
    filter: pb.filter("agent.user = {:u} && agent.confirmed = true && day >= {:f} && day <= {:t}", {
      u: userId,
      f: from,
      t: to,
    }),
    sort: "start",
    expand: "agent,agent.user",
    fields: SHIFT_FIELDS,
  });
  return rows.map(planningShift);
}

/**
 * Prestation du jour de l'agent : en cours, sinon la prochaine d'aujourd'hui, sinon la dernière d'aujourd'hui (nuit de
 * la veille comprise tant qu'elle dure). Une seule lecture par requête (layout + accueil : `cache`).
 */
export const todayShiftOf = cache(async (userId: string): Promise<PlanningShift | null> => {
  const today = brusselsDay();
  const list = await myShifts(userId, addDays(today, -1), today).catch(() => []);
  const now = Date.now();
  const live = list.find((s) => Date.parse(s.start) <= now && now < Date.parse(s.end));
  if (live) return live;
  const todays = list.filter((s) => s.day === today);
  return todays.find((s) => Date.parse(s.start) > now) ?? todays.at(-1) ?? null;
});

export type QuinyxSync = { label: string; at: string; from: string; to: string; count: number };

/** État des synchros par groupe (fraîcheur du planning). */
export async function quinyxSyncs(): Promise<QuinyxSync[]> {
  const pb = await pbForRequest();
  const rows = await pb.collection("quinyx_groups").getFullList({
    filter: "enabled = true",
    fields: "label,last_sync,last_from,last_to,last_count",
    sort: "label",
  });
  return rows.map((r) => ({
    label: str(r.label),
    at: iso(r.last_sync),
    from: str(r.last_from),
    to: str(r.last_to),
    count: Number(r.last_count) || 0,
  }));
}

// --- Administration ---

export type QuinyxGroupRow = {
  id: string;
  groupId: string;
  label: string;
  district: string;
  enabled: boolean;
  lastSync: string;
  lastFrom: string;
  lastTo: string;
  lastCount: number;
  lastBy: string;
  lastVersion: string;
};

export type QuinyxPlaceRow = { id: string; pattern: string; district: string };

export type QuinyxAgentRow = {
  id: string;
  quinyxId: string;
  name: string;
  userId: string;
  userName: string;
  confirmed: boolean;
  suggestedId: string;
  suggestedName: string;
  lastSeen: string;
};

export async function adminQuinyx(): Promise<{
  groups: QuinyxGroupRow[];
  places: QuinyxPlaceRow[];
  agents: QuinyxAgentRow[];
  users: { id: string; name: string }[];
}> {
  const pb = await pbForRequest();
  const [groups, places, agents, users] = await Promise.all([
    pb.collection("quinyx_groups").getFullList({ sort: "label", expand: "last_by" }),
    pb.collection("quinyx_places").getFullList({ sort: "pattern" }),
    pb
      .collection("quinyx_agents")
      .getFullList({ sort: "last_name,first_name", expand: "user,user_suggested" }),
    pb.collection("users").getFullList({
      fields: "id,name,username,role",
      filter: 'role != "connector" && role != "screen"',
      sort: "name",
    }),
  ]);
  const nameOf = (u: RecordModel | undefined) => (u ? str(u.name) || str(u.username) : "");
  return {
    groups: groups.map((g) => ({
      id: g.id,
      groupId: str(g.group_id),
      label: str(g.label),
      district: str(g.district),
      enabled: !!g.enabled,
      lastSync: iso(g.last_sync),
      lastFrom: str(g.last_from),
      lastTo: str(g.last_to),
      lastCount: Number(g.last_count) || 0,
      lastBy: nameOf(g.expand?.last_by as RecordModel | undefined),
      lastVersion: str(g.last_version),
    })),
    places: places.map((p) => ({ id: p.id, pattern: str(p.pattern), district: str(p.district) })),
    agents: agents.map((a) => ({
      id: a.id,
      quinyxId: str(a.quinyx_id),
      name: agentName(a),
      userId: str(a.user),
      userName: nameOf(a.expand?.user as RecordModel | undefined),
      confirmed: !!a.confirmed,
      suggestedId: str(a.user_suggested),
      suggestedName: nameOf(a.expand?.user_suggested as RecordModel | undefined),
      lastSeen: iso(a.last_seen),
    })),
    users: users
      .filter((u) => u.role !== "disabled")
      .map((u) => ({ id: u.id, name: str(u.name) || str(u.username) })),
  };
}
