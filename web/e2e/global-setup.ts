// Préparation commune des E2E : les comptes de test (E2E_IDENTITY, E2E_ADMIN_IDENTITY) ont « vu » toutes les
// versions du changelog, sinon la fenêtre « CSM a été mis à jour » (une fois par compte) recouvrirait les écrans des
// autres tests. `e2e/changelog.spec.ts` teste la fenêtre avec ses propres comptes. Même chose pour la visite guidée
// (`preferences.tour`, première connexion ; `e2e/tour.spec.ts` la teste avec des comptes jetables). Sans superuser : rien.

const pbUrl = process.env.PB_URL ?? "http://127.0.0.1:8090";

export const ALL_SEEN = "9999.12.31";
/** Visite guidée déjà vue (version très haute : jamais remontrée aux comptes E2E). */
export const TOUR_SEEN = { seen: "2026-11-04T00:00:00.000Z", version: 9999 };

export default async function globalSetup() {
  const email = process.env.PB_SUPERUSER_EMAIL;
  const password = process.env.PB_SUPERUSER_PASSWORD;
  const identities = [process.env.E2E_IDENTITY, process.env.E2E_ADMIN_IDENTITY].filter(
    (v): v is string => !!v,
  );
  if (!email || !password || identities.length === 0) return;
  const auth = await fetch(`${pbUrl}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identity: email, password }),
  });
  if (!auth.ok) return;
  const { token } = (await auth.json()) as { token: string };
  for (const identity of identities) {
    const field = identity.includes("@") ? "email" : "username";
    const list = await fetch(
      `${pbUrl}/api/collections/users/records?perPage=1&fields=id,preferences&filter=${encodeURIComponent(`${field}="${identity.replace(/"/g, "")}"`)}`,
      { headers: { authorization: token } },
    );
    if (!list.ok) continue;
    const user = ((await list.json()) as { items: { id: string; preferences: unknown }[] })
      .items[0];
    if (!user) continue;
    const preferences =
      user.preferences && typeof user.preferences === "object"
        ? (user.preferences as Record<string, unknown>)
        : {};
    const tour = preferences.tour as { version?: unknown } | undefined;
    if (preferences.changelogSeen === ALL_SEEN && tour?.version === TOUR_SEEN.version) continue;
    await fetch(`${pbUrl}/api/collections/users/records/${user.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: token },
      body: JSON.stringify({
        preferences: { ...preferences, changelogSeen: ALL_SEEN, tour: TOUR_SEEN },
      }),
    });
  }
}
