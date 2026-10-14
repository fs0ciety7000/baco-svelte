import { expect, test, type Page } from "@playwright/test";

import { noHorizontalScroll } from "./helpers";

// Administration (compte admin de test créé par la CI : E2E_ADMIN_IDENTITY / E2E_ADMIN_PASSWORD) : chaque écran
// s'ouvre sans erreur ni défilement horizontal (1440 et 390), création puis désactivation / réactivation d'un compte.

const adminId = process.env.E2E_ADMIN_IDENTITY ?? "";
const adminPw = process.env.E2E_ADMIN_PASSWORD ?? "";
test.skip(!adminId || !adminPw, "E2E_ADMIN_IDENTITY / E2E_ADMIN_PASSWORD non définis");

async function loginAdmin(page: Page) {
  await page.goto("/connexion");
  await page.getByLabel("E-mail ou identifiant").fill(adminId);
  await page.getByLabel("Mot de passe").fill(adminPw);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

const SCREENS: [string, RegExp][] = [
  ["/admin", /compte/],
  ["/admin/roles", /Nouveau rôle/],
  ["/admin/roles/paco", /Ce rôle/],
  ["/admin/audit", /audit|Aucune/i],
  ["/admin/extension", /Jetons de l'extension/],
  ["/admin/journal", /Catégorie donnée aux messages automatiques/],
  ["/admin/sante", /État/],
  // Administration › Référentiels (navigation v3).
  ["/admin/referentiels", /à vérifier/],
  ["/admin/referentiels/gares", /gare/],
  ["/admin/referentiels/lignes", /Nouvelle ligne/],
  ["/admin/referentiels/ptcar", /Ajouter un PtCar/],
  ["/admin/referentiels/ebp", /Ajouter une correspondance EBP/],
  ["/admin/referentiels/spi", /Ajouter un point SPI/],
  ["/admin/referentiels/pn", /Carte PN/],
  ["/admin/referentiels/imports", /Import quotidien/],
];

test("écrans d'administration", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loginAdmin(page);
  for (const [path, text] of SCREENS) {
    await page.goto(path);
    await expect(page.getByRole("main")).toContainText(text);
    await noHorizontalScroll(page);
  }
  expect(errors).toEqual([]);
});

test("administration dans la barre latérale (desktop)", async ({ page }, info) => {
  test.skip(info.project.name.includes("mobile"), "barre latérale desktop seulement");
  await loginAdmin(page);
  const section = page.getByTestId("sidebar-admin");
  await expect(section.getByRole("group", { name: "Supervision" })).toBeVisible();
  await page.getByTestId("sidebar-admin-sante").click();
  await expect(page).toHaveURL(/\/admin\/sante$/);
  await expect(page.getByTestId("sidebar-admin-sante")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("topbar-admin-page")).toContainText("Santé");
});

test("compte : création, désactivation, réactivation", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "parcours en desktop");
  await loginAdmin(page);
  await page.goto("/admin");
  const email = `e2e-${Date.now()}@test.local`;
  await page.getByRole("button", { name: "Nouveau compte" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: /E-mail/ }).fill(email);
  await dialog.getByRole("textbox", { name: /Nom affiché/ }).fill("Compte E2E");
  await dialog.getByRole("button", { name: "Créer le compte" }).click();
  await expect(page.getByTestId("temp-password")).not.toBeEmpty();
  await page.getByRole("button", { name: "J'ai transmis le mot de passe" }).click();
  await expect(page).toHaveURL(/\/admin\/utilisateurs\//);
  await expect(page.getByText("Appareils connectés (extension DICOS)")).toBeVisible();
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Désactiver le compte" }).click();
  await expect(page.getByRole("button", { name: "Réactiver" })).toBeVisible();
  await page.getByRole("button", { name: "Réactiver" }).click();
  await expect(page.getByRole("button", { name: "Désactiver le compte" })).toBeVisible();
});

test("référentiels : PtCar (créer, modifier, supprimer) et ligne manuelle", async ({
  page,
}, info) => {
  const tag =
    `${info.project.name === "desktop" ? "D" : "M"}${Date.now().toString(36).slice(-5)}`.toUpperCase();
  const abbr = `ZE${tag}`.slice(0, 12);
  await loginAdmin(page);
  await page.goto("/admin/referentiels");
  await expect(page.getByTestId("ref-quality")).toBeVisible();
  await expect(page.getByTestId("ref-card-gares")).toBeVisible();
  await expect(page.getByTestId("ref-admin-nav")).toBeVisible();
  await noHorizontalScroll(page);

  // PtCar : création (abréviation en majuscules), modification, suppression confirmée.
  await page.goto("/admin/referentiels/ptcar");
  await page.getByTestId("ref-create").click();
  const panel = page.getByRole("dialog").last();
  await panel.getByLabel("Abréviation").fill(abbr.toLowerCase());
  await panel.getByLabel("Nom (FR)").fill(`Gare E2E ${tag}`);
  await panel.getByTestId("ref-save").click();
  await expect(page.getByText("Fiche créée")).toBeVisible();
  await page.goto(`/admin/referentiels/ptcar?q=${abbr}`);
  const scope = page.getByTestId(
    info.project.name === "desktop" ? "ref-table-ptcar" : "ref-cards-ptcar",
  );
  await expect(scope).toContainText(abbr);
  await scope.getByRole("button", { name: new RegExp(`^Modifier ${abbr}`) }).click();
  const edit = page.getByRole("dialog").last();
  await edit.getByLabel("Nom (NL)").fill(`Station E2E ${tag}`);
  await edit.getByTestId("ref-save").click();
  await expect(page.getByText("Fiche enregistrée")).toBeVisible();
  await expect(scope).toContainText(`Station E2E ${tag}`);
  await scope.getByRole("button", { name: new RegExp(`^Supprimer ${abbr}`) }).click();
  await page.getByTestId("ref-delete-confirm").click();
  await expect(page.getByText("Fiche supprimée")).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText(`Gare E2E ${tag}`);

  // Ligne absente de l'horaire : créée « manuelle », puis supprimée.
  const line = `9${Date.now().toString().slice(-3)}${info.project.name === "desktop" ? "D" : "M"}`;
  await page.goto("/admin/referentiels/lignes");
  await page.getByTestId("line-create").click();
  await page.getByTestId("line-number").fill(line);
  await page.getByTestId("line-stations").fill("Gare A E2E\nGare B E2E");
  await page.getByTestId("line-save").click();
  await expect(page.getByText(`L.${line} créée`)).toBeVisible();
  await page.goto(`/admin/referentiels/lignes?q=${line}`);
  await expect(page.getByRole("main")).toContainText("Manuelle");
  await page
    .getByRole("button", { name: `Supprimer L.${line}` })
    .filter({ visible: true })
    .click();
  await page.getByRole("button", { name: "Supprimer définitivement" }).click();
  await expect(page.getByText(`L.${line} supprimée`)).toBeVisible();
});
