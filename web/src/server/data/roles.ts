import "server-only";

import { cache } from "react";

import { DEFAULT_ROLES, roleFromRecord, type RoleMeta } from "@/lib/roles";

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
