// Lecture du contenu d'un jeton PocketBase (JWT) sans vérifier la signature : sert uniquement à
// connaître l'agent et l'expiration. PocketBase vérifie le jeton à chaque appel.
export type TokenPayload = { id: string; exp: number };

export function tokenPayload(token: string): TokenPayload | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as Record<
      string,
      unknown
    >;
    return typeof json.id === "string" && typeof json.exp === "number"
      ? { id: json.id, exp: json.exp }
      : null;
  } catch {
    return null;
  }
}

export function tokenExpiry(token: string): number | null {
  return tokenPayload(token)?.exp ?? null;
}

export function isExpired(token: string, now = Date.now(), marginSeconds = 0): boolean {
  const exp = tokenExpiry(token);
  return exp === null || exp * 1000 <= now + marginSeconds * 1000;
}
