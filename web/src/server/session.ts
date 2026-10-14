import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import {
  actingAad,
  actingExpired,
  AS_COOKIE,
  parseActingCookie,
  readOnlyMessage,
} from "@/lib/impersonation";
import { openActingToken } from "@/server/acting-seal";

import { env } from "./env";
import { createPb, markReadOnlyToken } from "./pocketbase";
import { isExpired, tokenExpiry, tokenPayload } from "./token";

// Jeton PocketBase de l'agent, dans un cookie httpOnly : jamais lisible par le JavaScript du navigateur.
export const SESSION_COOKIE = "csm_session";

export function sessionCookieOptions(token: string) {
  const exp = tokenExpiry(token);
  return {
    httpOnly: true,
    secure: env.CSM_COOKIE_SECURE,
    sameSite: "lax" as const,
    path: "/",
    ...(exp ? { expires: new Date(exp * 1000) } : {}),
  };
}

/** Jeton de la session ouverte dans ce navigateur (l'administrateur pendant « Voir en tant que »). */
export async function readOwnSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export type Acting = {
  /** Jeton de la session du navigateur (l'admin pendant le mode). */
  own: string | null;
  /** Jeton à utiliser pour lire les données : celui de la cible pendant le mode, sinon `own`. */
  token: string | null;
  /** Pendant le mode : l'administrateur et la cible. */
  actor: { id: string; name: string } | null;
  target: { id: string; name: string; role: string } | null;
  /** Fin du jeton de la cible (secondes epoch). */
  exp: number | null;
  /** Cookie du mode présent mais refusé (expiré, admin rétrogradé, cible désactivée…) : à effacer. */
  stale: boolean;
};

/**
 * « Voir en tant que » (14 oct. 2026) : quel jeton sert à cette requête ? Le cookie `csm_as` n'est pris en compte que si
 * la session du navigateur appartient au même administrateur, toujours admin / sysop, et si le jeton de la cible est
 * valable (non expiré, cible encore lisible avec lui). Sinon il est ignoré (et effacé quand c'est possible). Le jeton
 * de la cible est marqué « lecture seule » pour tout client PocketBase créé avec lui.
 */
export const resolveActing = cache(async (): Promise<Acting> => {
  const jar = await cookies();
  const own = jar.get(SESSION_COOKIE)?.value ?? null;
  const raw = jar.get(AS_COOKIE)?.value;
  const none: Acting = { own, token: own, actor: null, target: null, exp: null, stale: false };
  if (!raw) return none;
  const cookie = parseActingCookie(raw);
  const ownId = own && !isExpired(own) ? tokenPayload(own)?.id : null;
  const stale = { ...none, stale: true };
  if (!cookie || !ownId || ownId !== cookie.adminId || actingExpired(cookie)) return drop(stale);
  // Jeton de la cible scellé dans le cookie : ouvert ici seulement, lié à l'admin, la cible et l'expiration.
  const opened = openActingToken(cookie.sealed, actingAad(cookie));
  const asPayload = opened ? tokenPayload(opened) : null;
  if (!opened || !asPayload || asPayload.id !== cookie.targetId || isExpired(opened))
    return drop(stale);
  const as = { adminId: cookie.adminId, token: opened };
  // Marqué avant toute requête : même un appel qui échouerait plus loin ne peut pas écrire.
  markReadOnlyToken(as.token, asPayload.exp);
  try {
    const [admin, target] = await Promise.all([
      createPb(own).collection("users").getOne(ownId, { fields: "id,name,username,role" }),
      createPb(as.token)
        .collection("users")
        .getOne(asPayload.id, { fields: "id,name,username,role" }),
    ]);
    const adminRole = String(admin.role ?? "");
    const targetRole = String(target.role ?? "");
    if (
      (adminRole !== "admin" && adminRole !== "sysop") ||
      ["admin", "sysop", "connector", "disabled"].includes(targetRole)
    )
      return drop(stale);
    const name = (r: Record<string, unknown>) => String(r.name || r.username || "");
    markReadOnlyToken(as.token, asPayload.exp, name(target));
    return {
      own,
      token: as.token,
      actor: { id: admin.id, name: name(admin) },
      target: { id: target.id, name: name(target), role: targetRole },
      exp: asPayload.exp,
      stale: false,
    };
  } catch {
    return drop(stale);
  }
});

async function drop(a: Acting): Promise<Acting> {
  try {
    (await cookies()).delete(AS_COOKIE);
  } catch {
    // Rendu d'une page : le cookie ne peut pas être effacé ici (le bandeau propose « Revenir à mon compte »).
  }
  return a;
}

/**
 * Jeton de la requête pour lire les données : celui de l'agent, ou celui de la cible pendant « Voir en tant que »
 * (client PocketBase alors en lecture seule).
 */
export async function readSessionToken(): Promise<string | null> {
  return (await resolveActing()).token;
}

/** Pendant « Voir en tant que », refuse toute écriture faite hors PocketBase (routes internes, fichiers…). */
export async function assertNotActing(): Promise<void> {
  const a = await resolveActing();
  if (a.actor || a.stale) throw new Error(readOnlyMessage(a.target?.name));
}

export async function writeSessionToken(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions(token));
  // Nouvelle session (connexion, rotation) : jamais de « Voir en tant que » hérité.
  jar.delete(AS_COOKIE);
}

export async function clearSessionToken(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(AS_COOKIE);
}
