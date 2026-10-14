// « Voir en tant que » (Administration, 14 oct. 2026) : logique pure partagée par le middleware (runtime edge), le
// serveur et le navigateur. Aucune importation : lu tel quel par le middleware.

/** Cookie httpOnly du mode : `<id de l'admin>~<jeton statique de la cible>` (le cookie de session de l'admin reste intact). */
export const AS_COOKIE = "csm_as";
/** Durée du jeton de la cible (non renouvelable). */
export const AS_TTL_S = 30 * 60;
/** Le cookie vit un peu plus longtemps que le jeton : le middleware constate l'expiration et la trace (fin du mode). */
export const AS_COOKIE_MAX_AGE_S = AS_TTL_S + 5 * 60;
/** En-tête posé sur un refus d'écriture (le navigateur affiche alors le message « Lecture seule »). */
export const READ_ONLY_HEADER = "x-csm-readonly";
/** Cookie lisible par le navigateur, posé quand une écriture a été refusée dans une Server Action (toast). */
export const READ_ONLY_HIT_COOKIE = "csm_ro_hit";
/** Seule écriture permise pendant le mode : y mettre fin. */
export const STOP_PATH = "/api/admin/en-tant-que/fin";

const ID = /^[a-z0-9-]{15,36}$/;
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function actingCookieValue(adminId: string, token: string): string {
  return `${adminId}~${token}`;
}

/** Lit le cookie du mode ; `null` s'il est absent ou mal formé. */
export function parseActingCookie(
  value: string | null | undefined,
): { adminId: string; token: string } | null {
  if (!value || value.length > 4096) return null;
  const i = value.indexOf("~");
  if (i < 0) return null;
  const adminId = value.slice(0, i);
  const token = value.slice(i + 1);
  return ID.test(adminId) && JWT.test(token) ? { adminId, token } : null;
}

const ADMINS = new Set(["admin", "sysop"]);
const FORBIDDEN = new Set(["admin", "sysop", "connector", "disabled"]);

/** Motif du refus (texte affiché), ou `null` si l'admin peut voir CSM en tant que ce compte. Miroir de lib/impersonate.js. */
export function impersonationRefusal(
  actor: { id: string; role: string },
  target: { id: string; role: string },
): string | null {
  if (!ADMINS.has(actor.role)) return "Réservé aux administrateurs.";
  if (target.id === actor.id) return "Impossible de te voir toi-même « en tant que ».";
  if (target.role === "disabled") return "Compte désactivé.";
  if (target.role === "connector") return "Compte de service : non consultable.";
  if (FORBIDDEN.has(target.role))
    return "Un autre administrateur ne peut pas être consulté « en tant que ».";
  return null;
}

/**
 * Exports et documents nominatifs refusés pendant le mode (même en lecture) : exports CSV, PDF des bons et de la B201,
 * brouillons .eml, feuille de route PMR, archives, pièces jointes du Journal.
 */
export function isBlockedRead(pathname: string): boolean {
  return (
    /^\/api\/.*\/export\/?$/.test(pathname) ||
    /^\/api\/pmr\/feuille-de-route\/?$/.test(pathname) ||
    /^\/api\/commandes\/.*\/(pdf|eml)\/?$/.test(pathname) ||
    /^\/api\/commandes\/archives(\/|$)/.test(pathname) ||
    /^\/api\/operations\/main-courante\/[^/]+\/fichiers(\/|$)/.test(pathname)
  );
}

/**
 * Requête refusée pendant le mode ? `"write"` : toute écriture (méthode autre que GET / HEAD / OPTIONS, routes
 * `/api/…` comprises), sauf la fin du mode et les Server Actions (lectures comprises : elles passent, mais toute
 * écriture PocketBase y est refusée par le client en lecture seule, `server/pocketbase.ts`) ; `"export"` : export
 * nominatif ; `null` : permise.
 */
export function actingBlock(
  method: string,
  pathname: string,
  isServerAction: boolean,
): "write" | "export" | null {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS")
    return isBlockedRead(pathname) ? "export" : null;
  if (pathname === STOP_PATH) return null;
  if (m === "POST" && isServerAction && !pathname.startsWith("/api/")) return null;
  return "write";
}

/** Une requête PocketBase avec le jeton de la cible est-elle une lecture ? (`/api/files/token` = jeton de fichier, lecture.) */
export function isPbRead(method: string | undefined, url: string): boolean {
  const m = (method ?? "GET").toUpperCase();
  if (m === "GET" || m === "HEAD") return true;
  try {
    return m === "POST" && new URL(url, "http://pb").pathname === "/api/files/token";
  } catch {
    return false;
  }
}

export function readOnlyMessage(name?: string | null): string {
  return name
    ? `Lecture seule : tu vois CSM en tant que ${name}.`
    : "Lecture seule : tu vois CSM en tant qu'un autre agent.";
}
