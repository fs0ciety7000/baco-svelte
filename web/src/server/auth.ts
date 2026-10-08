import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

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
