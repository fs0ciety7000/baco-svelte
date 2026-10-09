import "server-only";

import { timingSafeEqual } from "node:crypto";

import { env } from "@/server/env";
import { createPb } from "@/server/pocketbase";

// Commun aux endpoints alimentés par l'extension (DICOS : missions et groupes ; ATMS : horaires) : secret de
// connecteur `x-dicos-token` comparé à temps constant, et compte de service PocketBase (rôle `connector`).

export function tokenOk(provided: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(env.CSM_DICOS_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Ne masque QUE le 404 ; toute autre erreur remonte (audit du 8 oct.).
export function nullOn404(e: unknown): null {
  if (e && typeof e === "object" && (e as { status?: number }).status === 404) return null;
  throw e;
}

let service: { token: string; id: string; at: number } | null = null;
export async function serviceAuth() {
  if (service && Date.now() - service.at < 30 * 60_000) return service;
  const pb = createPb();
  const auth = await pb
    .collection("users")
    .authWithPassword(env.CSM_DICOS_PB_EMAIL, env.CSM_DICOS_PB_PASSWORD);
  service = { token: pb.authStore.token, id: auth.record.id, at: Date.now() };
  return service;
}
