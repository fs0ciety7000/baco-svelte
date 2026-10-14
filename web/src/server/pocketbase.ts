import "server-only";

import PocketBase, { ClientResponseError } from "pocketbase";

import { isPbRead, READ_ONLY_HIT_COOKIE, readOnlyMessage } from "@/lib/impersonation";

import { env } from "./env";

// Jetons « Voir en tant que » (jeton statique de la cible, 30 min) : tout client créé avec l'un d'eux est en LECTURE
// SEULE (deuxième barrière, après le middleware). Registre sur `globalThis` : la route, les actions et les pages
// chargent parfois deux copies du module.
const g = globalThis as unknown as {
  __csmReadOnlyTokens?: Map<string, { exp: number; name: string }>;
};
const readOnlyTokens = (g.__csmReadOnlyTokens ??= new Map());

/** Marque un jeton comme « lecture seule » jusqu'à son expiration (secondes epoch). */
export function markReadOnlyToken(token: string, exp: number, name = ""): void {
  const now = Date.now() / 1000;
  for (const [t, v] of readOnlyTokens) if (v.exp < now) readOnlyTokens.delete(t);
  readOnlyTokens.set(token, { exp, name });
}

/**
 * Client PocketBase à usage unique (une requête), authentifié avec le jeton de l'agent.
 * Les règles d'accès PocketBase s'appliquent donc à chaque appel. Jamais de client partagé entre
 * requêtes (le jeton d'un agent ne doit pas fuiter vers un autre), jamais de jeton superuser ici.
 */
export function createPb(token?: string | null): PocketBase {
  const pb = new PocketBase(env.PB_URL);
  pb.autoCancellation(false);
  if (token) pb.authStore.save(token, null);
  const ro = token ? readOnlyTokens.get(token) : undefined;
  if (ro) {
    pb.beforeSend = async (url, options) => {
      if (isPbRead(options.method, url)) return { url, options };
      // Signal pour le navigateur (toast « Lecture seule ») : possible dans une Server Action, pas pendant un rendu.
      try {
        const { cookies } = await import("next/headers");
        (await cookies()).set(READ_ONLY_HIT_COOKIE, "1", {
          path: "/",
          maxAge: 15,
          sameSite: "strict",
        });
      } catch {
        // Rendu d'une page : pas de cookie, l'écriture est refusée quand même.
      }
      throw new ClientResponseError({
        url,
        status: 403,
        response: { code: 403, message: readOnlyMessage(ro.name), data: {} },
      });
    };
  }
  return pb;
}
