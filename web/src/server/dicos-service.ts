import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { can, type PermissionSubject } from "@/lib/permissions";
import { env } from "@/server/env";
import { allow } from "@/server/rate-limit";
import { createPb } from "@/server/pocketbase";

// Commun aux endpoints alimentés par l'extension (DICOS : missions et groupes ; ATMS : horaires) : jeton de connecteur
// `x-dicos-token` — **personnel** (`csmc_…`, collection `connector_tokens`, généré par l'agent dans CSM) ou, pour les
// installations antérieures, le secret partagé `CSM_DICOS_TOKEN` comparé à temps constant — et compte de service
// PocketBase (rôle `connector`).

function sharedTokenOk(provided: string): boolean {
  if (!env.CSM_DICOS_TOKEN) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(env.CSM_DICOS_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const PERSONAL_TOKEN = /^csmc_[A-Za-z0-9_-]{43}$/;
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Ingestion possible : compte de service configuré (le secret partagé est facultatif depuis les jetons personnels). */
export const ingestConfigured = () => Boolean(env.CSM_DICOS_PB_EMAIL && env.CSM_DICOS_PB_PASSWORD);

export class ConnectorRateLimited extends Error {}

export type ConnectorAuth =
  { kind: "shared" } | { kind: "personal"; tokenId: string; userId: string };

// Jeton personnel → fiche (60 s de cache : une révocation prend effet en une minute au plus).
const personal = new Map<string, { auth: ConnectorAuth | null; at: number }>();
const touched = new Map<string, { at: number; version: string }>();

/**
 * Authentifie l'extension. `version` = en-tête `x-csm-extension` (notée sur le jeton, au plus toutes les 5 min).
 * Renvoie null si le jeton est inconnu, révoqué ou mal formé.
 */
export async function authenticateConnector(
  provided: string,
  version: string,
): Promise<ConnectorAuth | null> {
  if (!provided) return null;
  if (!PERSONAL_TOKEN.test(provided)) return sharedTokenOk(provided) ? { kind: "shared" } : null;
  const hash = hashToken(provided);
  const hit = personal.get(hash);
  let auth: ConnectorAuth | null;
  if (hit && Date.now() - hit.at < 60_000) auth = hit.auth;
  else {
    // Jetons inconnus : chaque essai coûte une requête PocketBase → débit global borné (audit du 9 oct. 2026).
    if (!allow("dicos-token-lookup", 120, 60_000)) throw new ConnectorRateLimited();
    const svc = await serviceAuth();
    const pb = createPb(svc.token);
    const rec = await pb
      .collection("connector_tokens")
      .getFirstListItem(pb.filter("token_hash = {:h}", { h: hash }), {
        expand: "user",
        fields: "id,user,expand.user.role,expand.user.grants,expand.user.denies",
      })
      .catch(nullOn404);
    // Droits du propriétaire relus à chaque recherche : compte désactivé ou droit retiré = jeton refusé.
    const owner = (rec?.expand as { user?: PermissionSubject } | undefined)?.user;
    let allowed = false;
    try {
      allowed = !!owner && can(owner, "deplacements:write");
    } catch {
      allowed = false;
    }
    auth = rec && allowed ? { kind: "personal", tokenId: rec.id, userId: String(rec.user) } : null;
    if (personal.size > 500) personal.clear();
    personal.set(hash, { auth, at: Date.now() });
  }
  if (auth?.kind === "personal") {
    const last = touched.get(auth.tokenId);
    if (!last || Date.now() - last.at > 5 * 60_000 || last.version !== version) {
      touched.set(auth.tokenId, { at: Date.now(), version });
      const svc = await serviceAuth();
      void createPb(svc.token)
        .collection("connector_tokens")
        .update(auth.tokenId, {
          last_used: new Date().toISOString(),
          ...(version ? { last_version: version } : {}),
        })
        .catch(() => null);
    }
  }
  return auth;
}

/** Version de l'extension annoncée (en-tête `x-csm-extension`), bornée. */
export function extensionVersion(request: Request): string {
  const v = request.headers.get("x-csm-extension") ?? "";
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v) ? v : "";
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
