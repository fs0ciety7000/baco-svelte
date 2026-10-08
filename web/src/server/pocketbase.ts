import "server-only";

import PocketBase from "pocketbase";

import { env } from "./env";

/**
 * Client PocketBase à usage unique (une requête), authentifié avec le jeton de l'agent.
 * Les règles d'accès PocketBase s'appliquent donc à chaque appel. Jamais de client partagé entre
 * requêtes (le jeton d'un agent ne doit pas fuiter vers un autre), jamais de jeton superuser ici.
 */
export function createPb(token?: string | null): PocketBase {
  const pb = new PocketBase(env.PB_URL);
  pb.autoCancellation(false);
  if (token) pb.authStore.save(token, null);
  return pb;
}
