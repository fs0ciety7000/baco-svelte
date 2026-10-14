import "server-only";

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import { env } from "@/server/env";

// Scellement du jeton de la cible dans le cookie `csm_as` (« Voir en tant que », audit sécurité du 14 oct. 2026) :
// AES-256-GCM, clé dérivée de CSM_INTERNAL_SECRET (HKDF-SHA256), données liées = admin~cible~expiration.

function key(): Buffer {
  return Buffer.from(hkdfSync("sha256", env.CSM_INTERNAL_SECRET, "csm", "csm_as v1", 32));
}

export function sealActingToken(token: string, aad: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  c.setAAD(Buffer.from(aad));
  const body = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
}

/** Jeton en clair, ou `null` si le scellé est altéré, d'une autre clé ou d'autres données liées. */
export function openActingToken(sealed: string, aad: string): string | null {
  try {
    const raw = Buffer.from(sealed, "base64url");
    if (raw.length < 29) return null;
    const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    d.setAAD(Buffer.from(aad));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
