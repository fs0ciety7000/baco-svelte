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
  await expect(page.getByTestId("dashboard-grid").locator("[data-widget]")).toHaveCount(9);
  // Accueil « À traiter » (11 oct. 2026) : bande de compteurs + file par gravité.
  await expect(page.getByTestId("todo-queue")).toBeVisible();
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
    // Navigation v3 (14 oct. 2026) : 4 modules + « Plus » ; libellé court affiché, nom complet annoncé.
    await expect(bar.getByRole("link")).toHaveText(["Accueil", "Opérations", "Bons", "PMR"]);
    await expect(bar.getByRole("link", { name: "Commandes", exact: true })).toBeVisible();
    await bar.getByRole("button", { name: "Plus" }).click();
    const sheet = page.getByRole("dialog", { name: "Plus" });
    await expect(sheet.getByRole("link", { name: "Réseau", exact: true })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Ressources", exact: true })).toBeVisible();
    // Module Équipe supprimé ; PACO/RCCA : pas d'administration.
    await expect(sheet.getByRole("link", { name: "Équipe", exact: true })).toHaveCount(0);
    await expect(sheet.getByRole("link", { name: "Administration" })).toHaveCount(0);
    await page.screenshot({ path: `test-results/shell-plus-${testInfo.project.name}.png` });
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  } else {
    const side = page.getByRole("navigation", { name: "Navigation principale" });
    // Les compteurs (non lus, à envoyer…) suivent le libellé du module.
    await expect(side.getByRole("list").getByRole("link")).toHaveText([
      /^Accueil/,
      /^Opérations/,
      /^Commandes/,
      /^PMR/,
      /^Réseau/,
      /^Ressources/,
    ]);
    // Chaque module ouvre sur ce que compte sa pastille : Suivi « À envoyer », Journal.
    await side.getByRole("link", { name: /^Commandes/ }).click();
    await expect(page).toHaveURL(/\/commandes\/suivi$/);
    await side.getByRole("link", { name: /^Opérations/ }).click();
    await expect(page).toHaveURL(/\/operations\/journal$/);
  }
  // Mon profil : menu du compte (navigation v3).
  await page.getByRole("button", { name: /^Menu de / }).click();
  await page.getByTestId("user-menu-profil").click();
  await expect(page).toHaveURL(/\/profil$/);
  await page.goto("/commandes");
  const tabs = page.getByRole("navigation", { name: "Onglets Commandes" });
  await expect(tabs.getByRole("link")).toHaveText([
    "Suivi",
    "Bus",
    "Taxi",
    "Archives",
    "Fournisseurs",
  ]);
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
  for (const path of ["/admin", "/admin/audit", "/admin/extension", "/admin/referentiels"]) {
    const admin = await page.goto(path);
    expect(admin?.status()).toBe(404);
    expect(await admin?.text()).not.toContain("bientôt");
  }
});

// Anciennes routes (navigation v3) : redirection permanente vers la nouvelle, chaîne de requête gardée (liens des
// notifications en base, favoris, ⌘K). Aucun lien cassé.
const OLD_ROUTES: [string, string][] = [
  ["/operations?train=1734&jour=2026-10-14", "/reseau?train=1734&jour=2026-10-14"],
  ["/operations/statistiques?du=2026-10-01", "/statistiques?du=2026-10-01"],
  ["/operations/carte-pn?pn=abc&q=7", "/reseau/pn?pn=abc&q=7"],
  ["/operations/main-courante?entree=abc", "/operations/journal?entree=abc"],
  ["/operations/main-courante/nouveau?train=1734", "/operations/journal?train=1734"],
  ["/referentiels?q=mons", "/ressources?q=mons"],
  ["/referentiels/trains?train=1734", "/reseau/horaires?train=1734"],
  ["/referentiels/lignes?ligne=96", "/reseau/lignes?ligne=96"],
  ["/referentiels/gares?q=fcr", "/reseau/gares?q=fcr"],
  ["/referentiels/ptcar?q=FMS", "/reseau/ptcar?q=FMS"],
  ["/referentiels/ebp?q=x", "/reseau/ebp?q=x"],
  ["/referentiels/documents?vue=documents", "/ressources/documents?vue=documents"],
  [
    "/referentiels/documents/voir/abcdefghijklmno?retour=documents",
    "/ressources/documents/voir/abcdefghijklmno?retour=documents",
  ],
  ["/admin/lignes?x=1", "/reseau/lignes?x=1"],
  ["/equipe?q=agent", "/ressources/equipe?q=agent"],
  ["/equipe/planning?jour=2026-10-14", "/ressources/planning?jour=2026-10-14"],
  ["/equipe/profil?x=1", "/profil?x=1"],
  ["/equipe/nouveautes", "/changelog"],
  ["/commandes/b201?jour=2026-10-14", "/operations/b201?jour=2026-10-14"],
  ["/ressources/b201?jour=2026-10-14", "/operations/b201?jour=2026-10-14"],
  ["/operations/releve?district=tous", "/operations/b201?district=tous"],
  ["/pmr/groupes?du=2026-10-14", "/groupes?du=2026-10-14"],
];

test("anciennes routes : redirection permanente, requête gardée", async ({ page, request }) => {
  for (const [from, to] of OLD_ROUTES) {
    const r = await request.get(from, { maxRedirects: 0 });
    expect(r.status(), from).toBe(308);
    expect(r.headers()["location"], from).toBe(to);
  }
  // Connecté : la page cible s'affiche (pas de 404) ; l'alias de l'extension reste servi.
  await login(page);
  for (const [from, to] of OLD_ROUTES.filter(([f]) => !f.includes("/voir/"))) {
    const res = await page.goto(from);
    expect(res?.status(), from).toBe(200);
    const url = new URL(page.url());
    expect(url.pathname + url.search, from).toBe(to);
  }
  const ext = await page.goto("/pmr/extension");
  expect(ext?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/pmr/extension");
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
