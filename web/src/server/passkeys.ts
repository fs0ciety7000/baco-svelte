import "server-only";

import { headers } from "next/headers";

import { env } from "./env";

// Passkeys (décision du 10 oct. 2026) : identité WebAuthn du site, défis à usage unique (mémoire d'une instance, 5 min,
// suffisant pour un seul conteneur web) et appels aux routes internes de PocketBase (secret partagé).

export const passkeysEnabled = () => env.CSM_INTERNAL_SECRET.length >= 32;

/** Origine et identifiant WebAuthn : CSM_PUBLIC_URL s'il est posé, sinon l'hôte de la requête (derrière Coolify). */
export async function relyingParty(): Promise<{ rpID: string; origin: string }> {
  if (env.CSM_PUBLIC_URL) {
    const u = new URL(env.CSM_PUBLIC_URL);
    return { rpID: u.hostname, origin: u.origin };
  }
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost").split(",")[0]!.trim();
  const proto = (h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https"))
    .split(",")[0]!
    .trim();
  return { rpID: host.replace(/:\d+$/, ""), origin: `${proto}://${host}` };
}

const challenges = new Map<string, { challenge: string; exp: number }>();

export function storeChallenge(key: string, challenge: string) {
  const now = Date.now();
  for (const [k, v] of challenges) if (v.exp < now) challenges.delete(k);
  challenges.set(key, { challenge, exp: now + 5 * 60_000 });
}

/** Défi attendu (consommé : une réponse ne sert qu'une fois). */
export function takeChallenge(key: string): string | null {
  const c = challenges.get(key);
  challenges.delete(key);
  return c && c.exp > Date.now() ? c.challenge : null;
}

export async function internal<T>(
  path: string,
  body: unknown,
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${env.PB_URL.replace(/\/$/, "")}/api/csm/passkey/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csm-internal": env.CSM_INTERNAL_SECRET },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as T };
}
