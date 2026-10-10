import "server-only";

import { cookies, headers } from "next/headers";

import { env } from "./env";
import { createPb } from "./pocketbase";
import { tokenPayload } from "./token";

// Sessions ouvertes (demande du 10 oct. 2026). Une fiche `user_sessions` par connexion, repérée par le cookie httpOnly
// `csm_sid` (obligatoire). Supprimer la fiche déconnecte l'appareil dans CSM ; « déconnecter les autres appareils » change
// en plus la clé des jetons de l'agent (le jeton ne sert plus nulle part, PocketBase compris).

export const SID_COOKIE = "csm_sid";

/** Suivi des sessions actif seulement avec le secret interne (création par la route interne de PocketBase). */
export const sessionsEnabled = () => env.CSM_INTERNAL_SECRET.length >= 32;
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
  if (!payload || !sessionsEnabled()) return;
  const sid = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("hex");
  try {
    // Création par la route interne de PocketBase (plafond par agent, champs non forgeables) : la règle refuse toute
    // création directe (revue sécurité du 10 oct. 2026).
    const res = await fetch(`${env.PB_URL.replace(/\/$/, "")}/api/csm/session/open`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-csm-internal": env.CSM_INTERNAL_SECRET },
      body: JSON.stringify({ user: payload.id, sid, method, ...(await clientInfo()) }),
      cache: "no-store",
    });
    if (!res.ok) return;
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

const missingCollection = (e: unknown) =>
  !!e &&
  typeof e === "object" &&
  "response" in e &&
  /missing collection/i.test(
    String((e as { response?: { message?: string } }).response?.message ?? ""),
  );
const isNotFound = (e: unknown) =>
  !!e && typeof e === "object" && "status" in e && (e as { status: number }).status === 404;

/**
 * Session encore valable ? Le cookie `csm_sid` est OBLIGATOIRE (revue sécurité du 10 oct. 2026 : sans cette exigence, un
 * voleur de cookie le supprimait et échappait à la révocation) : absent, invalide ou désignant une fiche supprimée →
 * déconnecté. Seule exception : collection `user_sessions` absente (déploiement partiel) → on laisse passer. Une erreur
 * réseau ne déconnecte pas. Note la dernière activité au plus toutes les 10 minutes.
 */
export async function sessionAlive(token: string): Promise<boolean> {
  if (!sessionsEnabled()) return true;
  const sid = await currentSid();
  const pb = createPb(token);
  if (!sid || !/^[a-f0-9]{32,64}$/.test(sid)) {
    try {
      await pb.collection("user_sessions").getList(1, 1, { fields: "id", skipTotal: true });
      return false;
    } catch (e) {
      return missingCollection(e) || !isNotFound(e);
    }
  }
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
    // Fiche absente → déconnecté ; collection absente ou panne → pas de déconnexion.
    return missingCollection(e) || !isNotFound(e);
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
