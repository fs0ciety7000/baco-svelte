import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { noHorizontalScroll } from "./helpers";

// Visite guidée (4 nov. 2026) : fenêtre d'accueil à la première connexion (à la place de « CSM a été mis à jour »),
// déroulé avec découpe et carte, Échap, préférence `tour` enregistrée, plus rien au rechargement, relance depuis le menu
// du compte (et ⌘K en desktop). Comptes jetables créés par le superuser (les comptes E2E communs ont « vu » la visite,
// voir global-setup.ts).

const pbUrl = process.env.PB_URL ?? "http://127.0.0.1:8090";
const hasSuperuser = !!process.env.PB_SUPERUSER_EMAIL && !!process.env.PB_SUPERUSER_PASSWORD;
test.skip(!hasSuperuser, "PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD non définis");

const latest = /^## \[([^\]]+)\]/m.exec(
  readFileSync(path.resolve(__dirname, "../../CHANGELOG.md"), "utf8"),
)![1]!;
const PASSWORD = "Visite-e2e-12345";
const shots = process.env.E2E_SHOTS_DIR ?? "test-results";

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

async function createAgent(token: string, tag: string) {
  const email = `visite-${tag}-${Date.now()}@csm.invalid`;
  const r = await fetch(`${pbUrl}/api/collections/users/records`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: token },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      name: "Agent Visite",
      role: "paco",
      verified: true,
    }),
  });
  expect(r.ok, await r.clone().text()).toBe(true);
  const { id } = (await r.json()) as { id: string };
  return { id, email };
}

async function prefsOf(token: string, id: string): Promise<Record<string, unknown>> {
  const r = await fetch(`${pbUrl}/api/collections/users/records/${id}?fields=preferences`, {
    headers: { authorization: token },
  });
  const { preferences } = (await r.json()) as { preferences: Record<string, unknown> | null };
  return preferences ?? {};
}

async function signIn(page: Page, email: string) {
  await page.goto("/connexion");
  await page.getByLabel("E-mail ou identifiant").fill(email);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** La carte tient dans la fenêtre. */
async function cardInView(page: Page) {
  const box = (await page.getByTestId("tour-card").boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
}

test("première connexion : accueil, quelques étapes, Échap, relance depuis le menu", async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name === "mobile";
  const token = await superuserToken();
  const agent = await createAgent(token, testInfo.project.name);
  try {
    await signIn(page, agent.email);
    const welcome = page.getByTestId("tour-welcome");
    await expect(welcome).toBeVisible();
    await expect(welcome).toContainText("Bienvenue dans CSM");
    await expect(welcome.getByTestId("tour-chapter-prise-en-main")).toBeVisible();
    await expect(welcome.getByTestId("tour-chapter-bus")).toBeVisible();
    await expect(welcome.getByTestId("tour-chapter-pmr")).toBeVisible();
    // Pas de double fenêtre : « CSM a été mis à jour » n'est pas montrée en plus.
    await expect(page.getByTestId("update-dialog")).toHaveCount(0);
    await noHorizontalScroll(page);
    await page.screenshot({ path: `${shots}/tour-welcome-${testInfo.project.name}.png` });

    await welcome.getByTestId("tour-start").click();
    const card = page.getByTestId("tour-card");
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-step", "modules");
    await expect(page.getByTestId("tour-counter")).toHaveText(/^1 \/ \d+$/);
    await expect(page.getByTestId("tour-spotlight")).toHaveAttribute("data-target", "on");
    await expect(page.getByTestId("tour-next")).toBeFocused();
    await cardInView(page);
    await page.screenshot({ path: `${shots}/tour-step1-${testInfo.project.name}.png` });

    await page.getByTestId("tour-next").click();
    await expect(card).toHaveAttribute("data-step", mobile ? "plus" : "temps-reel");
    await expect(page.getByTestId("tour-counter")).toHaveText(/^2 \/ \d+$/);
    await cardInView(page);

    // Clavier : → avance, ← recule.
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("tour-counter")).toHaveText(/^3 \/ \d+$/);
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("tour-counter")).toHaveText(/^2 \/ \d+$/);
    await page.screenshot({ path: `${shots}/tour-step2-${testInfo.project.name}.png` });

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("tour")).toHaveCount(0);
    await expect
      .poll(async () => (await prefsOf(token, agent.id)).tour)
      .toMatchObject({ version: 1 });
    expect((await prefsOf(token, agent.id)).changelogSeen).toBe(latest);

    // Plus jamais d'office.
    await page.reload();
    await expect(page.getByRole("button", { name: /Menu de Agent Visite/ })).toBeVisible();
    await page.waitForTimeout(900);
    await expect(page.getByTestId("tour-welcome")).toHaveCount(0);
    await expect(page.getByTestId("update-dialog")).toHaveCount(0);

    // Relance depuis le menu du compte, chapitre « Bus et taxis » : la visite change de page.
    await page.getByRole("button", { name: /Menu de Agent Visite/ }).click();
    await page.getByTestId("user-menu-tour").click();
    const again = page.getByTestId("tour-welcome");
    await expect(again).toContainText("Visite guidée");
    await again.getByTestId("tour-chapter-bus").click();
    await expect(page).toHaveURL(/\/commandes\/suivi/);
    await expect(card).toHaveAttribute("data-step", "suivi");
    await expect(page.getByTestId("tour-counter")).toHaveText(/^1 \/ 4$/);
    await cardInView(page);
    await noHorizontalScroll(page);
    await page.screenshot({ path: `${shots}/tour-bus-${testInfo.project.name}.png` });
    await page.getByTestId("tour-skip").click();
    await expect(page.getByTestId("tour")).toHaveCount(0);

    if (!mobile) {
      // ⌘K : « Revoir la visite guidée ».
      await page.keyboard.press("Control+k");
      await page.getByPlaceholder(/Gare, train/).fill("visite guidée");
      await page.getByTestId("palette-tour").click();
      await expect(page.getByTestId("tour-welcome")).toContainText("Visite guidée");
      await page.getByTestId("tour-later").click();
      await expect(page.getByTestId("tour-welcome")).toHaveCount(0);
    }
  } finally {
    await fetch(`${pbUrl}/api/collections/users/records/${agent.id}`, {
      method: "DELETE",
      headers: { authorization: token },
    });
  }
});

test("« Plus tard » : la visite est notée vue, sans s'ouvrir", async ({ page }, testInfo) => {
  const token = await superuserToken();
  const agent = await createAgent(token, `tard-${testInfo.project.name}`);
  try {
    await signIn(page, agent.email);
    await page.getByTestId("tour-later").click();
    await expect(page.getByTestId("tour-welcome")).toHaveCount(0);
    await expect(page.getByTestId("tour")).toHaveCount(0);
    await expect
      .poll(async () => (await prefsOf(token, agent.id)).tour)
      .toMatchObject({ version: 1 });
  } finally {
    await fetch(`${pbUrl}/api/collections/users/records/${agent.id}`, {
      method: "DELETE",
      headers: { authorization: token },
    });
  }
});
