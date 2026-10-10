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
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/$/);
}

const SCREENS: [string, RegExp][] = [
  ["/admin", /compte/],
  ["/admin/lignes", /Lignes|ligne/],
  ["/admin/audit", /audit|Aucune/i],
  ["/admin/extension", /Jetons de l'extension/],
  ["/admin/journal", /Catégorie donnée aux messages automatiques/],
  ["/admin/sante", /État/],
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
