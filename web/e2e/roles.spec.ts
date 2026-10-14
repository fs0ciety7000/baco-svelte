import { expect, test, type Browser, type Page } from "@playwright/test";

import { ALL_SEEN } from "./global-setup";
import { chooseOption, noHorizontalScroll } from "./helpers";

// Administration › Rôles (rôles v3, lots L4-L5) : créer un rôle à partir de PACO/RCCA, retirer un droit, l'attribuer à un
// compte jetable, vérifier qu'un onglet disparaît pour ce compte (connexion de ce compte), annuler le changement depuis
// l'historique, supprimer le rôle (réaffectation proposée) ; fiche d'un agent : ajustements en phrases. 1440 et 390.
// Compte admin E2E (E2E_ADMIN_*) ; compte jetable créé par le superuser (PB_SUPERUSER_*).

const adminId = process.env.E2E_ADMIN_IDENTITY ?? "";
const adminPw = process.env.E2E_ADMIN_PASSWORD ?? "";
const pbUrl = process.env.PB_URL ?? "http://127.0.0.1:8090";
const hasSuperuser = !!process.env.PB_SUPERUSER_EMAIL && !!process.env.PB_SUPERUSER_PASSWORD;
test.skip(!adminId || !adminPw || !hasSuperuser, "E2E_ADMIN_* / PB_SUPERUSER_* non définis");

const PASSWORD = "Roles-e2e-123456";
const shots = process.env.E2E_SHOTS_DIR;

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
  const email = `roles-${tag}-${Date.now()}@csm.invalid`;
  const r = await fetch(`${pbUrl}/api/collections/users/records`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: token },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      name: `Agent Rôles ${tag}`,
      role: "paco",
      verified: true,
      preferences: { changelogSeen: ALL_SEEN },
    }),
  });
  expect(r.ok, await r.clone().text()).toBe(true);
  const { id } = (await r.json()) as { id: string };
  return { id, email };
}

async function cleanup(token: string, agentId: string, label: string) {
  await fetch(`${pbUrl}/api/collections/users/records/${agentId}`, {
    method: "DELETE",
    headers: { authorization: token },
  });
  const list = await fetch(
    `${pbUrl}/api/collections/roles/records?filter=${encodeURIComponent(`label="${label}"`)}`,
    { headers: { authorization: token } },
  );
  const items = ((await list.json()) as { items?: { id: string }[] }).items ?? [];
  for (const r of items)
    await fetch(`${pbUrl}/api/collections/roles/records/${r.id}`, {
      method: "DELETE",
      headers: { authorization: token },
    });
}

async function loginAdmin(page: Page) {
  await page.goto("/connexion");
  await page.getByLabel("E-mail ou identifiant").fill(adminId);
  await page.getByLabel("Mot de passe").fill(adminPw);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** Onglet Statistiques (Accueil depuis la navigation v3) vu par le compte jetable (nouvelle session). */
async function agentTabs(
  browser: Browser,
  email: string,
  viewport: { width: number; height: number },
) {
  const ctx = await browser.newContext({ viewport, locale: "fr-BE" });
  const page = await ctx.newPage();
  await page.goto("/connexion");
  await page.getByLabel("E-mail ou identifiant").fill(email);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  const stats = await page.getByRole("link", { name: "Statistiques", exact: true }).count();
  const status = (await page.goto("/statistiques"))?.status() ?? 0;
  await ctx.close();
  return { stats, status };
}

test("rôle : créer, retirer un droit, attribuer, annuler, supprimer", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120_000);
  const mobile = info.project.name.includes("mobile");
  const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
  const token = await superuserToken();
  const agent = await createAgent(token, info.project.name);
  const label = `E2E rôle ${info.project.name} ${Date.now() % 100000}`;
  page.on("dialog", (d) => void d.accept());
  try {
    await loginAdmin(page);
    // Liste des rôles.
    await page.goto("/admin/roles");
    await expect(page.getByTestId("role-card-paco")).toBeVisible();
    await expect(page.getByText("Les droits disponibles sont fixés par CSM")).toBeVisible();
    await noHorizontalScroll(page);
    if (shots)
      await page.screenshot({ path: `${shots}/l4l5-liste-${viewport.width}.png`, fullPage: true });

    // Nouveau rôle à partir de PACO/RCCA.
    await page.getByTestId("new-role").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("radio", { name: /^PACO\/RCCA/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await dialog.getByTestId("new-role-next").click();
    await dialog.getByRole("textbox", { name: /Nom du rôle/ }).fill(label);
    await dialog.getByTestId("new-role-create").click();
    await expect(page).toHaveURL(/\/admin\/roles\/e2e-role-/);
    const roleUrl = page.url();

    // Retirer « Voir les statistiques ».
    await page.getByTestId("role-search").fill("statistiques");
    const row = page.getByTestId("perm-stats:read");
    await expect(row.getByRole("switch")).toBeChecked();
    await row.getByRole("switch").click();
    await expect(row.getByRole("switch")).not.toBeChecked();
    if (mobile) await page.getByRole("radio", { name: /Résultat/ }).click();
    await expect(page.getByTestId("role-unsaved")).toContainText("Voir les statistiques");
    await noHorizontalScroll(page);
    if (shots) {
      await expect(page.getByText(/Rôle « .* » créé\./)).toBeHidden({ timeout: 10_000 });
      if (!mobile) await page.getByTestId("role-search").fill("");
      await page.screenshot({ path: `${shots}/l4l5-editeur-${viewport.width}.png` });
    }
    await page.getByTestId("role-save").click();
    await expect(page.getByTestId("role-save-summary")).toContainText("Voir les statistiques");
    await page.getByTestId("role-save-confirm").click();
    await expect(page.getByText("Rôle enregistré.")).toBeVisible();

    // Attribuer le rôle au compte jetable (fiche de l'agent).
    await page.goto(`/admin/utilisateurs/${agent.id}`);
    await chooseOption(page, "Rôle", label);
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page.getByText("Compte enregistré.")).toBeVisible();
    await expect(page.getByTestId("agent-preview-cannot")).toContainText("Voir les statistiques");

    // Le compte ne voit plus l'onglet Statistiques.
    const without = await agentTabs(browser, agent.email, viewport);
    expect(without.stats).toBe(0);
    expect(without.status).toBe(404);

    // Annuler le changement depuis l'historique.
    await page.goto(roleUrl);
    await page.getByTestId("role-history").click();
    const hist = page.getByTestId("role-history-list");
    await expect(hist).toContainText("a retiré « Voir les statistiques »");
    await hist.getByRole("button", { name: "Annuler ce changement" }).first().click();
    await expect(page.getByText("Changement annulé.")).toBeVisible();
    const back = await agentTabs(browser, agent.email, viewport);
    expect(back.stats).toBeGreaterThan(0);
    expect(back.status).toBe(200);

    // Supprimer : réaffectation proposée (le rôle est attribué).
    await page.goto(roleUrl);
    await page.getByTestId("role-delete").click();
    await expect(page.getByRole("dialog")).toContainText("encore attribué à 1 agent");
    await page.getByTestId("role-delete-confirm").click();
    await expect(page).toHaveURL(/\/admin\/roles$/);
    await expect(page.getByText(label)).toHaveCount(0);
  } finally {
    await cleanup(token, agent.id, label);
  }
});

test("fiche d'un agent : ajustements en phrases", async ({ page }, info) => {
  const mobile = info.project.name.includes("mobile");
  const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
  const token = await superuserToken();
  const agent = await createAgent(token, `${info.project.name}-adj`);
  try {
    await loginAdmin(page);
    await page.goto(`/admin/utilisateurs/${agent.id}`);
    await expect(page.getByTestId("no-adjustment")).toBeVisible();
    await page.getByTestId("add-adjustment").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("adjustment-search").fill("supprimer un bon bus");
    await dialog.getByRole("button", { name: "Donner en plus" }).first().click();
    await expect(page.getByTestId("adjustment-otto:delete")).toContainText("En plus");
    await page.getByTestId("add-adjustment").click();
    await page.getByRole("dialog").getByTestId("adjustment-search").fill("noms et coordonnées");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Retirer ce droit" })
      .first()
      .click();
    await expect(page.getByTestId("adjustment-pmr:read")).toContainText("Retiré");
    await page.getByTestId("save-adjustments").click();
    await expect(page.getByText("Ajustements enregistrés.")).toBeVisible();
    if (mobile) await page.getByRole("radio", { name: "Résultat" }).click();
    await expect(page.getByTestId("agent-preview-can")).toContainText("Supprimer un bon bus");
    await expect(page.getByTestId("agent-preview-cannot")).toContainText(
      "Voir les noms et coordonnées",
    );
    await noHorizontalScroll(page);
    if (mobile) await page.getByRole("radio", { name: "Ajustements" }).click();
    if (shots) {
      await expect(page.getByText("Ajustements enregistrés.")).toBeHidden({ timeout: 10_000 });
      await page.getByTestId("agent-rights").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${shots}/l4l5-agent-${viewport.width}.png` });
    }
    // Retirer un ajustement.
    await page
      .getByRole("button", { name: "Retirer l'ajustement « Supprimer un bon bus »" })
      .click();
    await page.getByTestId("save-adjustments").click();
    await expect(page.getByText("Ajustements enregistrés.")).toBeVisible();
    await expect(page.getByTestId("adjustment-otto:delete")).toHaveCount(0);
    // Vue experte repliée.
    await expect(page.getByTestId("expert-view")).not.toHaveAttribute("open", "");
  } finally {
    await fetch(`${pbUrl}/api/collections/users/records/${agent.id}`, {
      method: "DELETE",
      headers: { authorization: token },
    });
  }
});
