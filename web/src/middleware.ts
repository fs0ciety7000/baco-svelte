import { NextResponse, type NextRequest } from "next/server";

import { isExpired } from "@/server/token";

// Garde de premier niveau : sans jeton valide, redirection vers /connexion. La vraie vérification
// (agent existant, non désactivé, rôle) est faite côté serveur à chaque page et par PocketBase.
// Rafraîchit le jeton PocketBase quand il expire dans moins de 24 h.

const SESSION_COOKIE = "csm_session";
const PUBLIC = ["/connexion"];
const REFRESH_MARGIN_S = 24 * 3600;

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
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

  const res = NextResponse.next();
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
