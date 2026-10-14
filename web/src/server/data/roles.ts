import "server-only";

import { cache } from "react";

import { DEFAULT_ROLES, roleFromRecord, type RoleMeta } from "@/lib/roles";
import { adjustmentSignature } from "@/lib/roles-editor";

import { pbForRequest } from "./orders";

// Rôles (lot L3) : collection `roles`, lue avec le jeton de l'agent (tout agent actif la lit : libellés, couleurs).
// Lecture seule ici ; l'écran Administration › Rôles (lot L4) écrira par ses propres actions (admin / sysop, garde-fous
// dans les hooks PocketBase).

/** Rôles triés (ordre d'affichage), une fois par requête ; repli sur les rôles système si la collection est illisible. */
export const listRoles = cache(async (): Promise<RoleMeta[]> => {
  try {
    const pb = await pbForRequest();
    const items = await pb.collection("roles").getFullList({
      sort: "sort,label",
      fields: "id,key,label,description,color,perms,system,locked,sort,based_on",
    });
    const roles = items.map((r) => roleFromRecord(r)).filter((r) => r.key);
    return roles.length ? roles : DEFAULT_ROLES;
  } catch {
    return DEFAULT_ROLES;
  }
});

/** Un rôle par son identifiant (`users.role`). */
export async function getRole(key: string): Promise<RoleMeta | null> {
  return (await listRoles()).find((r) => r.key === key) ?? null;
}

/** Identifiants des rôles existants (validation des formulaires d'administration). */
export async function roleKeys(): Promise<string[]> {
  return (await listRoles()).map((r) => r.key);
}

/** Nombre d'agents par rôle (désactivés comptés à part) : admin seulement (lecture des comptes). */
export async function roleUsage(): Promise<Record<string, { active: number; disabled: number }>> {
  const pb = await pbForRequest();
  const users = await pb
    .collection("users")
    .getFullList({ fields: "role,disabled_role", batch: 1000 });
  const out: Record<string, { active: number; disabled: number }> = {};
  for (const u of users) {
    const disabled = u.role === "disabled";
    const key = String(disabled ? u.disabled_role || "disabled" : u.role);
    out[key] ??= { active: 0, disabled: 0 };
    if (disabled) out[key].disabled++;
    else out[key].active++;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Administration › Rôles (lot L4) : lectures réservées aux admin / sysop (les pages appellent `requireAdmin()`).

export type AdminRole = RoleMeta & {
  id: string;
  updated: string;
  updatedByName: string;
  basedOnLabel: string;
};

const nameOf = (u: unknown) => {
  const r = (u && typeof u === "object" ? u : {}) as Record<string, unknown>;
  return String(r.name || r.username || "");
};
const arr = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Rôles avec identifiant, date et auteur de la dernière modification. */
export async function listRolesAdmin(): Promise<AdminRole[]> {
  const pb = await pbForRequest();
  const items = await pb.collection("roles").getFullList({
    sort: "sort,label",
    expand: "updated_by",
    fields:
      "id,key,label,description,color,perms,system,locked,sort,based_on,updated,expand.updated_by.name,expand.updated_by.username",
  });
  const byId = new Map(items.map((r) => [r.id, String(r.label ?? "")]));
  return items
    .map((r) => ({
      ...roleFromRecord(r),
      id: r.id,
      updated: String(r.updated ?? ""),
      updatedByName: nameOf(r.expand?.updated_by),
      basedOnLabel: byId.get(String(r.based_on ?? "")) ?? "",
    }))
    .filter((r) => r.key);
}

export type RoleAgent = { id: string; name: string; disabled: boolean };

/** Agents d'un rôle (et comptes désactivés qui le retrouveront à la réactivation). */
export async function roleAgents(key: string): Promise<RoleAgent[]> {
  const pb = await pbForRequest();
  const rows = await pb.collection("users").getFullList({
    filter: pb.filter("role = {:k} || (role = 'disabled' && disabled_role = {:k})", { k: key }),
    sort: "name,username",
    fields: "id,name,username,role",
  });
  return rows.map((u) => ({
    id: u.id,
    name: String(u.name || u.username || "Sans nom"),
    disabled: u.role === "disabled",
  }));
}

export type RoleHistoryRow = {
  id: string;
  action: string;
  changes: unknown;
  at: string;
  userName: string;
};

/** Historique d'un rôle : journal d'audit de la collection `roles` (30 dernières lignes). */
export async function roleHistory(id: string): Promise<RoleHistoryRow[]> {
  const pb = await pbForRequest();
  const res = await pb.collection("audit_log").getList(1, 30, {
    filter: pb.filter("collection = 'roles' && record = {:r}", { r: id }),
    sort: "-at",
    fields: "id,action,changes,at,user",
  });
  const ids = [...new Set(res.items.map((r) => String(r.user ?? "")).filter(Boolean))];
  const names = new Map<string, string>();
  if (ids.length) {
    const users = await pb.collection("users").getFullList({
      filter: ids.map((u) => pb.filter("id = {:u}", { u })).join(" || "),
      fields: "id,name,username",
    });
    for (const u of users) names.set(u.id, nameOf(u));
  }
  return res.items.map((r) => ({
    id: r.id,
    action: String(r.action ?? ""),
    changes: r.changes ?? {},
    at: String(r.at ?? ""),
    userName: names.get(String(r.user ?? "")) || "Système",
  }));
}

/** Nombre d'agents actifs (hors service) par empreinte d'ajustements (« Créer un rôle à partir de ces ajustements »). */
export async function adjustmentPeers(): Promise<Map<string, number>> {
  const pb = await pbForRequest();
  const users = await pb.collection("users").getFullList({
    filter: "role != 'disabled' && role != 'connector'",
    fields: "role,grants,denies",
    batch: 1000,
  });
  const out = new Map<string, number>();
  for (const u of users) {
    const sig = adjustmentSignature(String(u.role), arr(u.grants), arr(u.denies));
    if (sig) out.set(sig, (out.get(sig) ?? 0) + 1);
  }
  return out;
}
