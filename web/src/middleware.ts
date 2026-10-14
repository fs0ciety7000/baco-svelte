import { NextResponse, type NextRequest } from "next/server";

import {
  AS_COOKIE,
  READ_ONLY_HEADER,
  actingBlock,
  actingExpired,
  parseActingCookie,
  readOnlyMessage,
} from "@/lib/impersonation";
import { isExpired, tokenPayload } from "@/server/token";

// Garde de premier niveau : sans jeton valide, redirection vers /connexion. La vraie vérification
// (agent existant, non désactivé, rôle) est faite côté serveur à chaque page et par PocketBase.
// Rafraîchit le jeton PocketBase quand il expire dans moins de 24 h.

const SESSION_COOKIE = "csm_session";
// `/brand` : logos statiques (pied de page de la page de connexion), sans donnée.
// PWA : manifeste, icônes, service worker et page hors connexion (chargés sans cookie par le navigateur).
// `/robots.txt` : lu par les robots sans cookie (redirigé vers /connexion, il était illisible).
const PUBLIC = [
  "/connexion",
  "/robots.txt",
  "/brand",
  "/icons",
  "/manifest.webmanifest",
  "/sw.js",
  "/offline.html",
];
const REFRESH_MARGIN_S = 24 * 3600;
// Outil interne : aucune réponse ne doit être indexée (aussi posé par next.config.ts et la balise meta du layout).
const ROBOTS = "noindex, nofollow";

/**
 * Content-Security-Policy avec nonce par requête (Next l'applique à ses propres scripts) :
 * le navigateur ne charge et n'appelle que le domaine CSM (connect-src 'self' : ni PocketBase, ni Supabase).
 * style-src 'unsafe-inline' : styles posés par GSAP, Radix et Sonner.
 */
export function contentSecurityPolicy(
  nonce: string,
  dev = process.env.NODE_ENV !== "production",
): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const valid = !!token && !isExpired(token);
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isApi = pathname.startsWith("/api/");

  // « Voir en tant que » (14 oct. 2026) : cookie `csm_as` valable seulement avec la session du même admin et un jeton de
  // la cible non expiré. Pendant le mode, toute écriture est refusée ici (403), sauf la fin du mode et les Server
  // Actions (où le client PocketBase de la cible refuse toute écriture : server/pocketbase.ts) ; exports nominatifs aussi.
  const asRaw = request.cookies.get(AS_COOKIE)?.value;
  let clearAs = false;
  if (asRaw) {
    const as = parseActingCookie(asRaw);
    const ownId = valid && token ? tokenPayload(token)?.id : null;
    if (!as || !token || !ownId || as.adminId !== ownId) clearAs = true;
    else if (actingExpired(as)) {
      clearAs = true;
      await auditExpiredActing(token, as.targetId);
    } else {
      const block = actingBlock(request.method, pathname, request.headers.has("next-action"));
      if (block) {
        const res = new NextResponse(
          JSON.stringify({ message: readOnlyMessage(), code: `readonly-${block}` }),
          { status: 403, headers: { "content-type": "application/json; charset=utf-8" } },
        );
        res.headers.set(READ_ONLY_HEADER, block);
        res.headers.set("x-robots-tag", ROBOTS);
        res.headers.set("cache-control", "no-store");
        return res;
      }
    }
  }

  if (!valid && !isPublic && !isApi) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = pathname === "/" ? "" : `?suite=${encodeURIComponent(pathname + search)}`;
    const res = NextResponse.redirect(url);
    res.headers.set("x-robots-tag", ROBOTS);
    if (token) res.cookies.delete(SESSION_COOKIE);
    if (asRaw) res.cookies.delete(AS_COOKIE);
    return res;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  // Fichiers de la bibliothèque : la route pose sa propre CSP (visionneuse PDF, cadre même origine).
  if (!/^\/api\/referentiels\/documents\/[a-z0-9]{15}$/.test(pathname))
    res.headers.set("content-security-policy", csp);
  res.headers.set("x-robots-tag", ROBOTS);
  // Cloudflare réécrit les adresses e-mail du HTML (« Email Address Obfuscation ») : le texte ne correspond plus au rendu
  // React → erreur d'hydratation (Journal, Annuaire, Admin) et liens mailto cassés (10 oct. 2026). `no-transform` lui
  // interdit toute réécriture du contenu.
  if (!isApi && !/\.[a-z0-9]+$/i.test(pathname))
    res.headers.set(
      "cache-control",
      "private, no-cache, no-store, max-age=0, must-revalidate, no-transform",
    );
  if (clearAs) res.cookies.delete(AS_COOKIE);
  if (valid && isExpired(token, Date.now(), REFRESH_MARGIN_S)) {
    try {
      const pbUrl = process.env.PB_URL ?? "http://127.0.0.1:8090";
      const r = await fetch(`${pbUrl}/api/collections/users/auth-refresh`, {
        method: "POST",
        headers: { authorization: token },
      });
      if (r.ok) {
        const { token: fresh } = (await r.json()) as { token: string };
        res.cookies.set(SESSION_COOKIE, fresh, {
          httpOnly: true,
          secure: process.env.CSM_COOKIE_SECURE !== "false",
          sameSite: "lax",
          path: "/",
          maxAge: 7 * 24 * 3600,
        });
      }
    } catch {
      // PocketBase injoignable : on garde le jeton actuel, la page affichera l'erreur.
    }
  }
  return res;
}

/** Fin de « Voir en tant que » par expiration du jeton de la cible : tracée dans le journal d'audit (jamais bloquant). */
async function auditExpiredActing(own: string, target: string): Promise<void> {
  const secret = process.env.CSM_INTERNAL_SECRET ?? "";
  if (secret.length < 32 || !target) return;
  try {
    const pbUrl = (process.env.PB_URL ?? "http://127.0.0.1:8090").replace(/\/$/, "");
    await fetch(`${pbUrl}/api/csm/impersonate/stop`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-csm-internal": secret, authorization: own },
      body: JSON.stringify({ target }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Trace perdue : le mode se termine quand même.
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
