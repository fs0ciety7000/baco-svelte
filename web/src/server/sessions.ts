import "server-only";

import { cookies, headers } from "next/headers";

import { env } from "./env";
import { createPb } from "./pocketbase";
import { tokenPayload } from "./token";

// Sessions ouvertes (demande du 10 oct. 2026). Une fiche `user_sessions` par connexion, repérée par le cookie httpOnly
// `csm_sid`. Supprimer la fiche déconnecte l'appareil : `getCurrentUser` refuse un cookie de session inconnu. Un ancien
// cookie sans `csm_sid` (connexion antérieure) reste accepté ; « déconnecter les autres appareils » change en plus la clé
// des jetons de l'agent, ce qui les coupe aussi.

export const SID_COOKIE = "csm_sid";
const TOUCH_MS = 10 * 60_000;

async function clientInfo() {
  const h = await headers();
  return {
    user_agent: (h.get("user-agent") ?? "").slice(0, 300),
    ip: (h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "").slice(
      0,
      64,
    ),
  };
}

/** Ouvre une session après une connexion réussie (jeton tout juste obtenu) ; jamais bloquant. */
export async function startSession(token: string, method: "password" | "passkey"): Promise<void> {
  const payload = tokenPayload(token);
  if (!payload) return;
  const sid = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("hex");
  try {
    await createPb(token)
      .collection("user_sessions")
      .create({
        user: payload.id,
        sid,
        method,
        last_seen: new Date().toISOString().replace("T", " "),
        ...(await clientInfo()),
      });
    (await cookies()).set(SID_COOKIE, sid, {
      httpOnly: true,
      secure: env.CSM_COOKIE_SECURE,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 400,
    });
  } catch {
    // Collection absente (déploiement en cours) : la connexion reste valable, sans suivi de session.
  }
}

export async function currentSid(): Promise<string | null> {
  return (await cookies()).get(SID_COOKIE)?.value ?? null;
}

/**
 * Session encore valable ? Faux seulement si un cookie `csm_sid` désigne une fiche supprimée (appareil déconnecté).
 * Note la dernière activité au plus toutes les 10 minutes.
 */
export async function sessionAlive(token: string): Promise<boolean> {
  const sid = await currentSid();
  if (!sid || !/^[a-f0-9]{32,64}$/.test(sid)) return true;
  const pb = createPb(token);
  try {
    const s = await pb
      .collection("user_sessions")
      .getFirstListItem(pb.filter("sid = {:sid}", { sid }), { fields: "id,last_seen" });
    const seen = Date.parse(String(s.last_seen ?? "").replace(" ", "T"));
    if (!Number.isFinite(seen) || Date.now() - seen > TOUCH_MS)
      void pb
        .collection("user_sessions")
        .update(s.id, { last_seen: new Date().toISOString().replace("T", " ") })
        .catch(() => undefined);
    return true;
  } catch (e) {
    // 404 = fiche supprimée → déconnecté ; toute autre erreur (réseau, collection absente) ne déconnecte pas.
    return !(
      e &&
      typeof e === "object" &&
      "status" in e &&
      (e as { status: number }).status === 404
    );
  }
}

/** Ferme la session courante (déconnexion). */
export async function endSession(token: string | null): Promise<void> {
  const sid = await currentSid();
  (await cookies()).delete(SID_COOKIE);
  if (!token || !sid) return;
  const pb = createPb(token);
  try {
    const s = await pb
      .collection("user_sessions")
      .getFirstListItem(pb.filter("sid = {:sid}", { sid }), { fields: "id" });
    await pb.collection("user_sessions").delete(s.id);
  } catch {}
}
