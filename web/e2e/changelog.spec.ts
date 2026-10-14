import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { noHorizontalScroll } from "./helpers";

// Nouveautés (14 oct. 2026) : page /changelog (CHANGELOG.md + annonces), redirection de /equipe/nouveautes, lien en
// pied de barre latérale / dans « Plus », fenêtre « CSM a été mis à jour » une seule fois par compte. Comptes jetables
// créés par le superuser (les comptes E2E communs ont tout « vu », voir global-setup.ts).

const pbUrl = process.env.PB_URL ?? "http://127.0.0.1:8090";
const hasSuperuser = !!process.env.PB_SUPERUSER_EMAIL && !!process.env.PB_SUPERUSER_PASSWORD;
test.skip(!hasSuperuser, "PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD non définis");

const latest = /^## \[([^\]]+)\]/m.exec(
  readFileSync(path.resolve(__dirname, "../../CHANGELOG.md"), "utf8"),
)![1]!;
const PASSWORD = "Changelog-e2e-12345";

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

async function createAgent(token: string, tag: string, preferences?: Record<string, unknown>) {
  const email = `changelog-${tag}-${Date.now()}@csm.invalid`;
  const r = await fetch(`${pbUrl}/api/collections/users/records`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: token },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      name: "Agent Nouveautés",
      role: "paco",
      verified: true,
      ...(preferences ? { preferences } : {}),
    }),
  });
  expect(r.ok, await r.clone().text()).toBe(true);
  const { id } = (await r.json()) as { id: string };
  return { id, email };
}

async function seenOf(token: string, id: string): Promise<unknown> {
  const r = await fetch(`${pbUrl}/api/collections/users/records/${id}?fields=preferences`, {
    headers: { authorization: token },
  });
  const { preferences } = (await r.json()) as { preferences: Record<string, unknown> | null };
  return preferences?.changelogSeen;
}

async function signIn(page: Page, email: string) {
  await page.goto("/connexion");
  await page.getByLabel("E-mail ou identifiant").fill(email);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

const dialogOf = (page: Page) => page.getByRole("dialog", { name: "CSM a été mis à jour" });

test("fenêtre de mise à jour une seule fois, puis page Nouveautés", async ({ page }, testInfo) => {
  const token = await superuserToken();
  const agent = await createAgent(token, testInfo.project.name, { changelogSeen: "2000.01.01" });
  try {
    await signIn(page, agent.email);
    const dialog = dialogOf(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`Version ${latest}`);
    await expect(dialog.getByRole("link", { name: "Voir tout le changelog" })).toBeVisible();
    // La fenêtre tient dans l'écran (mobile compris).
    const box = (await dialog.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
    await noHorizontalScroll(page);
    await page.screenshot({ path: `test-results/changelog-modal-${testInfo.project.name}.png` });

    await dialog.getByRole("button", { name: "OK" }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => seenOf(token, agent.id)).toBe(latest);

    // Plus jamais pour cette version.
    await page.reload();
    await expect(page.getByRole("button", { name: /Menu de Agent Nouveautés/ })).toBeVisible();
    await page.waitForTimeout(800);
    await expect(dialogOf(page)).toHaveCount(0);

    // Ancienne adresse : redirection permanente vers /changelog.
    const res = await page.request.get("/equipe/nouveautes", { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers().location).toMatch(/\/changelog$/);

    // Lien de la barre latérale (desktop) ou de « Plus » (mobile), avec la version.
    if (testInfo.project.name === "mobile") {
      await page.getByRole("button", { name: "Plus" }).click();
      const link = page.getByTestId("more-changelog");
      await expect(link).toContainText(`Version ${latest}`);
      await link.click();
    } else {
      const link = page.getByTestId("sidebar-changelog");
      await expect(link).toContainText(latest);
      await link.click();
    }
    await expect(page).toHaveURL(/\/changelog$/);
    await expect(page.getByTestId(`release-${latest}`)).toBeVisible();
    await expect(page.getByTestId(`release-${latest}`)).toContainText("Actuelle");
    await expect(page.getByRole("tab", { name: /Annonces de l’équipe/ })).toBeVisible();
    await noHorizontalScroll(page);
    await page.screenshot({
      path: `test-results/changelog-page-${testInfo.project.name}.png`,
      fullPage: true,
    });
    await page.getByRole("tab", { name: /Annonces de l’équipe/ }).click();
    await expect(page.getByRole("tabpanel")).toBeVisible();

    await page.goto("/equipe/nouveautes");
    await expect(page).toHaveURL(/\/changelog$/);
  } finally {
    await fetch(`${pbUrl}/api/collections/users/records/${agent.id}`, {
      method: "DELETE",
      headers: { authorization: token },
    });
  }
});

test("nouveau compte : « Voir tout le changelog » ouvre la page et vaut lecture", async ({
  page,
}, testInfo) => {
  const token = await superuserToken();
  const agent = await createAgent(token, `neuf-${testInfo.project.name}`);
  try {
    await signIn(page, agent.email);
    const dialog = dialogOf(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole("link", { name: "Voir tout le changelog" }).click();
    await expect(page).toHaveURL(/\/changelog$/);
    await expect(dialogOf(page)).toHaveCount(0);
    await expect.poll(() => seenOf(token, agent.id)).toBe(latest);
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Menu de Agent Nouveautés/ })).toBeVisible();
    await page.waitForTimeout(800);
    await expect(dialogOf(page)).toHaveCount(0);
  } finally {
    await fetch(`${pbUrl}/api/collections/users/records/${agent.id}`, {
      method: "DELETE",
      headers: { authorization: token },
    });
  }
});
