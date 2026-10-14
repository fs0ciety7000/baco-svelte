import "server-only";

import { sealActingToken } from "@/server/acting-seal";

import { cookies } from "next/headers";

import {
  AS_COOKIE,
  AS_COOKIE_MAX_AGE_S,
  actingAad,
  actingCookieValue,
  parseActingCookie,
} from "@/lib/impersonation";

import { env } from "./env";
import { readOwnSessionToken } from "./session";
import { tokenPayload } from "./token";

// « Voir en tant que » (14 oct. 2026) : appels aux routes internes de PocketBase (secret partagé + jeton de l'admin),
// qui vérifient elles-mêmes l'appelant et la cible et tracent début et fin dans le journal d'audit.

const base = () => env.PB_URL.replace(/\/$/, "");
export const impersonationEnabled = () => env.CSM_INTERNAL_SECRET.length >= 32;

/** Démarre le mode : jeton statique de la cible (30 min) posé dans le cookie `csm_as`. Renvoie un message d'erreur ou null. */
export async function startImpersonation(targetId: string): Promise<string | null> {
  if (!impersonationEnabled()) return "Fonction indisponible : secret interne non configuré.";
  const own = await readOwnSessionToken();
  const adminId = own ? tokenPayload(own)?.id : null;
  if (!own || !adminId) return "Session expirée : reconnecte-toi.";
  let res: Response;
  try {
    res = await fetch(`${base()}/api/csm/impersonate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csm-internal": env.CSM_INTERNAL_SECRET,
        authorization: own,
      },
      body: JSON.stringify({ target: targetId }),
      cache: "no-store",
    });
  } catch {
    return "PocketBase injoignable.";
  }
  const body = (await res.json().catch(() => ({}))) as { token?: unknown; message?: unknown };
  if (!res.ok || typeof body.token !== "string")
    return typeof body.message === "string" && res.status !== 404
      ? body.message
      : "Impossible de voir CSM en tant que ce compte.";
  const payload = tokenPayload(body.token);
  if (!payload?.id || !payload.exp) return "Impossible de voir CSM en tant que ce compte.";
  const meta = { adminId, targetId: payload.id, exp: payload.exp };
  const value = actingCookieValue(
    adminId,
    payload.id,
    payload.exp,
    sealActingToken(body.token, actingAad(meta)),
  );
  (await cookies()).set(AS_COOKIE, value, {
    httpOnly: true,
    secure: env.CSM_COOKIE_SECURE,
    sameSite: "strict",
    path: "/",
    maxAge: AS_COOKIE_MAX_AGE_S,
  });
  return null;
}

/** Trace la fin du mode (jamais bloquant). */
export async function auditImpersonationStop(own: string, targetId: string): Promise<void> {
  if (!impersonationEnabled() || !targetId) return;
  try {
    await fetch(`${base()}/api/csm/impersonate/stop`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csm-internal": env.CSM_INTERNAL_SECRET,
        authorization: own,
      },
      body: JSON.stringify({ target: targetId }),
      cache: "no-store",
    });
  } catch {
    // Trace perdue (PocketBase injoignable) : le mode se termine quand même.
  }
}

/** Termine le mode (bouton, déconnexion) : trace la fin et efface le cookie. Renvoie l'id de la cible, s'il y en avait une. */
export async function stopImpersonation(): Promise<string | null> {
  const jar = await cookies();
  const as = parseActingCookie(jar.get(AS_COOKIE)?.value);
  jar.delete(AS_COOKIE);
  if (!as) return null;
  const own = await readOwnSessionToken();
  const targetId = as.targetId;
  if (own && tokenPayload(own)?.id === as.adminId && targetId)
    await auditImpersonationStop(own, targetId);
  return targetId;
}
