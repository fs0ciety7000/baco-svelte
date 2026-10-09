import { expect, test } from "@playwright/test";

import { identity, login, password } from "./helpers";

// Lot 3 de la finition (audit UX du 9 oct. 2026) : recherche de données dans ⌘K, raccourci « / », fraîcheur DICOS.

test.skip(!identity || !password, "E2E_IDENTITY / E2E_PASSWORD non définis");

test("la palette cherche aussi dans les données (train)", async ({ page, isMobile }) => {
  test.skip(isMobile, "raccourci clavier : desktop");
  await login(page);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Palette de commandes" });
  await dialog.getByRole("combobox").fill("3804");
  await expect(dialog.getByRole("option", { name: /Train 3804/ })).toBeVisible();
});

test("« / » place le curseur dans la recherche de la page", async ({ page, isMobile }) => {
  test.skip(isMobile, "raccourci clavier : desktop");
  await login(page, "/commandes");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("/");
  await expect(page.locator('main [role="search"] input[name="q"]')).toBeFocused();
});

test("Missions PMR : état de la synchro DICOS affiché", async ({ page }) => {
  await login(page, "/pmr");
  await expect(page.getByTestId("dicos-sync")).toBeVisible();
});

test("« Effacer » vide vraiment les filtres (formulaire remonté à chaque URL)", async ({
  page,
  isMobile,
}) => {
  await login(page, "/commandes");
  const q = page.locator('main [role="search"] input[name="q"]');
  await q.fill("zzz");
  await q.press("Enter");
  await expect(page).toHaveURL(/q=zzz/);
  // En mobile, « Effacer » est dans les filtres repliés.
  if (isMobile) await page.getByRole("button", { name: /^Filtres/ }).click();
  await page.getByRole("link", { name: "Effacer" }).click();
  await expect(page).toHaveURL(/\/commandes$/);
  await expect(page.locator('main [role="search"] input[name="q"]')).toHaveValue("");
});

test("« Masquer les annulées » se bascule et garde les autres filtres", async ({ page }) => {
  await login(page, "/pmr");
  for (const path of ["/pmr", "/groupes"]) {
    await page.goto(`${path}?district=DSO`);
    const chip = page.getByTestId("hide-cancelled");
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await chip.click();
    await expect(page).toHaveURL(/annulees=masquees/);
    await expect(page).toHaveURL(/district=DSO/);
    await expect(page.getByTestId("hide-cancelled")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("hide-cancelled").click();
    await expect(page).not.toHaveURL(/annulees=/);
  }
});
