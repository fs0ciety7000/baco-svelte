import { NextResponse, type NextRequest } from "next/server";

import { isExpired } from "@/server/token";

// Garde de premier niveau : sans jeton valide, redirection vers /connexion. La vraie vérification
// (agent existant, non désactivé, rôle) est faite côté serveur à chaque page et par PocketBase.
// Rafraîchit le jeton PocketBase quand il expire dans moins de 24 h.

const SESSION_COOKIE = "csm_session";
// `/brand` : logos statiques (pied de page de la page de connexion), sans donnée.
// PWA : manifeste, icônes, service worker et page hors connexion (chargés sans cookie par le navigateur).
const PUBLIC = [
  "/connexion",
  "/brand",
  "/icons",
  "/manifest.webmanifest",
  "/sw.js",
  "/offline.html",
];
const REFRESH_MARGIN_S = 24 * 3600;

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

  if (!valid && !isPublic && !isApi) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = pathname === "/" ? "" : `?suite=${encodeURIComponent(pathname + search)}`;
    const res = NextResponse.redirect(url);
    if (token) res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("content-security-policy", csp);
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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
