import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { can } from "@/lib/permissions";
import { visibleModules } from "@/navigation";

import { createPb } from "./pocketbase";
import { readSessionToken } from "./session";
import { isExpired, tokenPayload } from "./token";

export const ROLES = [
  "admin",
  "sysop",
  "moderator",
  "otto_agent",
  "user",
  "reader",
  "disabled",
] as const;

const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().default(""),
  username: z.string().default(""),
  role: z.enum(ROLES),
  grants: z.array(z.string()).nullable().default([]),
  denies: z.array(z.string()).nullable().default([]),
  district: z.string().default(""),
  avatar: z.string().default(""),
  preferences: z.unknown().optional(),
});

export type SessionUser = z.infer<typeof userSchema>;

/**
 * Agent connecté, relu dans PocketBase une fois par requête (rôle toujours à jour, compte désactivé
 * ou supprimé = déconnecté). Le rafraîchissement du jeton est fait par le middleware.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = await readSessionToken();
  const payload = token ? tokenPayload(token) : null;
  if (!token || !payload || isExpired(token)) return null;
  const pb = createPb(token);
  try {
    const record = await pb.collection("users").getOne(payload.id);
    const user = userSchema.parse(record);
    return user.role === "disabled" ? null : user;
  } catch {
    return null;
  }
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  return user;
}

export function isAdmin(user: SessionUser): boolean {
  return user.role === "admin" || user.role === "sysop";
}

/** Garde de page : 404 si l'agent n'a pas la permission (on ne révèle pas l'existence de l'écran). */
export async function requirePermission(permission: string): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, permission)) notFound();
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdmin(user)) notFound();
  return user;
}

/** Garde d'un onglet de navigation : mêmes règles que les menus (permission + rôles masqués). */
export async function requireRoute(href: string): Promise<SessionUser> {
  const user = await requireUser();
  const allowed = visibleModules(user).some((m) => m.tabs.some((t) => t.href === href));
  if (!allowed) notFound();
  return user;
}
