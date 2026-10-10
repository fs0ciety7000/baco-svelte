import { expect, test } from "@playwright/test";

import { identity, login, noHorizontalScroll, password } from "./helpers";

// Shell (étape 3) : navigation à 6 entrées, onglets en routes, ⌘K, mobile 4 + « Plus », tableau de bord
// réorganisable. Captures : test-results/shell-*.png.

test.skip(!identity || !password, "E2E_IDENTITY / E2E_PASSWORD non définis");

test("tableau de bord, CSP et absence d'erreur", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  const res = await page.goto("/connexion");
  expect(res?.headers()["content-security-policy"]).toContain("connect-src 'self'");
  await login(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Bonjour, Agent/);
  await expect(page.getByTestId("dashboard-grid").locator("[data-widget]")).toHaveCount(10);
  await page.waitForTimeout(800);
  await noHorizontalScroll(page);
  await page.screenshot({
    path: `test-results/shell-accueil-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("navigation principale et onglets en routes", async ({ page, isMobile }, testInfo) => {
  await login(page);
  if (isMobile) {
    const bar = page.getByRole("navigation", { name: "Navigation principale" });
    await expect(bar.getByRole("link")).toHaveText([
      "Accueil",
      "Commandes",
      "PMR",
      "Opérations",
      "Annuaire",
    ]);
    await bar.getByRole("button", { name: "Plus" }).click();
    const sheet = page.getByRole("dialog", { name: "Plus" });
    // L'Annuaire est dans la barre du bas depuis le 9 oct. 2026 : plus dans « Plus ».
    await expect(sheet.getByRole("link", { name: "Annuaire et données", exact: true })).toHaveCount(
      0,
    );
    await expect(sheet.getByRole("link", { name: "Équipe", exact: true })).toBeVisible();
    // Agent (rôle user) : pas d'administration.
    await expect(sheet.getByRole("link", { name: "Administration" })).toHaveCount(0);
    await page.screenshot({ path: `test-results/shell-plus-${testInfo.project.name}.png` });
    await sheet.getByRole("link", { name: "Mon profil" }).click();
    await expect(page).toHaveURL(/\/equipe\/profil$/);
  } else {
    const side = page.getByRole("navigation", { name: "Navigation principale" });
    await expect(side.getByRole("list").getByRole("link")).toHaveText([
      "Accueil",
      "Commandes",
      "PMR",
      "Opérations",
      "Annuaire et données",
      "Équipe",
    ]);
    await side.getByRole("link", { name: "Commandes" }).click();
    await expect(page).toHaveURL(/\/commandes$/);
  }
  await page.goto("/commandes");
  const tabs = page.getByRole("navigation", { name: "Onglets Commandes" });
  await expect(tabs.getByRole("link")).toHaveText(["Bus", "Taxi", "Suivi", "Remise B201"]);
  await expect(tabs.getByRole("link", { name: "Bus" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "Suivi" }).click();
  await expect(page).toHaveURL(/\/commandes\/suivi$/);
  await expect(tabs.getByRole("link", { name: "Suivi" })).toHaveAttribute("aria-current", "page");
  await page.goto("/commandes");
  await page.waitForTimeout(500);
  await noHorizontalScroll(page);
  await page.screenshot({
    path: `test-results/shell-commandes-${testInfo.project.name}.png`,
    fullPage: true,
  });
  // Administration : 404 pour un agent, et rien du contenu de la page dans la réponse (flux RSC compris).
  for (const path of ["/admin", "/admin/audit", "/admin/extension"]) {
    const admin = await page.goto(path);
    expect(admin?.status()).toBe(404);
    expect(await admin?.text()).not.toContain("bientôt");
  }
});

test("palette ⌘K : s'ouvre au raccourci, jamais sur un « K » tapé, et navigue", async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(isMobile, "raccourci clavier : desktop");
  await login(page);
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Palette de commandes" });
  await expect(palette).toBeVisible();
  await page.keyboard.type("opérations journal");
  await page.screenshot({ path: `test-results/shell-palette-${testInfo.project.name}.png` });
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/operations\/journal$/);
  await expect(palette).toBeHidden();
  // Bug v1 : un « K » majuscule dans un champ ouvrait la palette.
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox").fill("");
  await page.keyboard.press("Escape");
  await page.goto("/design");
  await page.getByPlaceholder("Gare d'origine").first().fill("KKK");
  await expect(page.getByRole("dialog", { name: "Palette de commandes" })).toHaveCount(0);
});

test("tableau de bord : personnaliser, réordonner, masquer, mémoriser", async ({ page }) => {
  await login(page);
  const widgets = page.getByTestId("dashboard-grid").locator("[data-widget]");
  const first = await widgets.first().getAttribute("data-widget");
  await page.getByRole("button", { name: "Personnaliser" }).click();
  const second = await widgets.nth(1).getAttribute("data-widget");
  await page
    .getByRole("button", { name: /^Monter/ })
    .nth(1)
    .click();
  await expect(widgets.first()).toHaveAttribute("data-widget", second!);
  await page.getByRole("button", { name: /^Masquer « Trains perturbés »/ }).click();
  await page.getByRole("button", { name: "Terminer" }).click();
  await expect(page.getByText("Disposition enregistrée")).toBeVisible();
  await page.reload();
  await expect(widgets.first()).toHaveAttribute("data-widget", second!);
  await expect(page.locator('[data-widget="trains"]')).toHaveCount(0);
  // Remise en état pour les autres tests.
  await page.getByRole("button", { name: "Personnaliser" }).click();
  await page
    .getByRole("button", { name: /^Monter/ })
    .nth(1)
    .click();
  await expect(widgets.first()).toHaveAttribute("data-widget", first!);
  await page.getByRole("button", { name: /^Afficher « Trains perturbés »/ }).click();
  await page.getByRole("button", { name: "Terminer" }).click();
  await expect(page.getByText("Disposition enregistrée")).toBeVisible();
});
