"use client";

import { createContext, useContext, type ReactNode } from "react";

import { DEFAULT_ROLES, roleLabel, type RoleMeta } from "@/lib/roles";

// Rôles (libellés, couleurs) lus dans la collection `roles` par le layout de l'application (lot L3) et transmis aux
// composants client (avatars, menu de l'agent, profil). Sans fournisseur : rôles système par défaut.
const RolesContext = createContext<RoleMeta[]>(DEFAULT_ROLES);

export function RolesProvider({ roles, children }: { roles: RoleMeta[]; children: ReactNode }) {
  return <RolesContext.Provider value={roles}>{children}</RolesContext.Provider>;
}

export function useRoles(): RoleMeta[] {
  return useContext(RolesContext);
}

/** Libellé d'un rôle (« PACO/RCCA »…), identifiant s'il est inconnu. */
export function useRoleLabel(): (key: string) => string {
  const roles = useRoles();
  return (key: string) => roleLabel(key, roles);
}
