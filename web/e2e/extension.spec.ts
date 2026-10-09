import { expect, test } from "@playwright/test";

import { identity, login, password } from "./helpers";

// Page PMR › Extension DICOS : paquets téléchargeables, jeton de connecteur personnel (sans extension dans le
// navigateur de test : repli « jeton à coller »), révocation, et route de téléchargement protégée.

test.skip(!identity || !password, "E2E_IDENTITY / E2E_PASSWORD non définis");

test("téléchargement réservé aux agents connectés", async ({ request }) => {
  const r = await request.get("/api/pmr/extension/release.json", { maxRedirects: 0 });
  expect([401, 404]).toContain(r.status());
});

test("jeton personnel généré, listé puis révoqué", async ({ page }) => {
  await login(page, "/pmr/extension");
  await expect(page.getByRole("link", { name: /Télécharger/ }).first()).toBeVisible();
  await expect(page.getByText(/Extension non détectée/)).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: /Générer un jeton/ }).click();
  const manual = page.getByTestId("manual-token");
  await expect(manual).toContainText(/csmc_[A-Za-z0-9_-]{43}/);
  const token = (await manual.locator("code").first().innerText()).trim();
  const list = page.getByTestId("connector-tokens");
  await expect(list).toContainText(token.slice(0, 10));
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
  const row = list.locator("li", { hasText: token.slice(0, 10) });
  await row.getByRole("button", { name: "Révoquer" }).click();
  await row.getByRole("button", { name: "Confirmer la révocation" }).click();
  await expect(page.getByText(`${token.slice(0, 10)}…`)).toHaveCount(0);
});
