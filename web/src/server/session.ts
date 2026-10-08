import "server-only";

import { cookies } from "next/headers";

import { env } from "./env";
import { tokenExpiry } from "./token";

// Jeton PocketBase de l'agent, dans un cookie httpOnly : jamais lisible par le JavaScript du navigateur.
export const SESSION_COOKIE = "csm_session";

export function sessionCookieOptions(token: string) {
  const exp = tokenExpiry(token);
  return {
    httpOnly: true,
    secure: env.CSM_COOKIE_SECURE,
    sameSite: "lax" as const,
    path: "/",
    ...(exp ? { expires: new Date(exp * 1000) } : {}),
  };
}

export async function readSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function writeSessionToken(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(token));
}

export async function clearSessionToken(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
