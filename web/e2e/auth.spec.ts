import { expect, test } from "@playwright/test";

// Parcours d'authentification et de temps réel contre un PocketBase local importé.
// Variables : E2E_IDENTITY / E2E_PASSWORD (agent de test, rôle user), PB_URL + PB_SUPERUSER_EMAIL /
// PB_SUPERUSER_PASSWORD (pour provoquer un changement côté serveur). Voir web/CLAUDE.md.

const identity = process.env.E2E_IDENTITY ?? "";
const password = process.env.E2E_PASSWORD ?? "";
const pbUrl = process.env.PB_URL ?? "http://127.0.0.1:8090";

test.skip(!identity || !password, "E2E_IDENTITY / E2E_PASSWORD non définis");

async function superuserToken(): Promise<string> {
  const r = await fetch(`${pbUrl}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      identity: process.env.PB_SUPERUSER_EMAIL,
      password: process.env.PB_SUPERUSER_PASSWORD,
    }),
  });
  return ((await r.json()) as { token: string }).token;
}

test("sans session, toute page renvoie vers la connexion", async ({ page }) => {
  await page.goto("/commandes");
  await expect(page).toHaveURL(/\/connexion\?suite=%2Fcommandes$/);
  const res = await page.request.get("/api/events");
  expect(res.status()).toBe(401);
});

test("un mauvais mot de passe est refusé sans détail", async ({ page }) => {
  await page.goto("/connexion");
  await page.getByLabel("E-mail ou identifiant").fill(identity);
  await page.getByLabel("Mot de passe").fill("mauvais-mot-de-passe");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("Identifiant ou mot de passe incorrect.")).toBeVisible();
});

test("connexion par cookie httpOnly, données et temps réel via le seul domaine CSM", async ({
  page,
  context,
}, testInfo) => {
  const foreign: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.host !== "localhost:3000") foreign.push(req.url());
  });
  page.on("websocket", (ws) => foreign.push(`websocket ${ws.url()}`));

  await page.goto("/commandes");
  await page.getByLabel("E-mail ou identifiant").fill(identity);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/commandes$/);
  await expect(page.getByRole("button", { name: /Menu de Agent E2E/ })).toBeVisible();

  const cookie = (await context.cookies()).find((c) => c.name === "csm_session");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  expect(await page.evaluate(() => document.cookie)).not.toContain("csm_session");

  // Relais SSE : un changement côté serveur rafraîchit la liste.
  await expect(page.getByTestId("live-state")).toHaveText("En direct");
  const counter = page.getByTestId("orders-count");
  const before = (await counter.textContent()) ?? "";

  const token = await superuserToken();
  const created = await fetch(`${pbUrl}/api/collections/bus_orders/records`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: token },
    body: JSON.stringify({
      status: "brouillon",
      reason: `E2E ${testInfo.project.name}`,
      origin: "Mons",
      destination: "Charleroi",
      order_date: "2099-01-01 00:00:00.000Z",
    }),
  });
  const { id } = (await created.json()) as { id: string };
  try {
    // Le compteur change sans rechargement (les deux projets créent une commande en parallèle).
    await expect(counter).not.toHaveText(before);
    await page.screenshot({
      path: `test-results/commandes-${testInfo.project.name}.png`,
      fullPage: true,
    });
  } finally {
    await fetch(`${pbUrl}/api/collections/bus_orders/records/${id}`, {
      method: "DELETE",
      headers: { authorization: token },
    });
  }

  // Pas de défilement horizontal de page (mobile obligatoire).
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  expect(foreign, "le navigateur ne doit appeler que le domaine CSM").toEqual([]);

  await page.getByRole("button", { name: /Menu de Agent E2E/ }).click();
  await page.getByRole("menuitem", { name: "Déconnexion" }).click();
  await expect(page).toHaveURL(/\/connexion$/);
  expect((await context.cookies()).find((c) => c.name === "csm_session")).toBeUndefined();
});
