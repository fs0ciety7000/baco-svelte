import { expect, type Page } from "@playwright/test";

export const identity = process.env.E2E_IDENTITY ?? "";
export const password = process.env.E2E_PASSWORD ?? "";

export async function login(page: Page, next = "/") {
  await page.goto(`/connexion${next === "/" ? "" : `?suite=${encodeURIComponent(next)}`}`);
  await page.getByLabel("E-mail ou identifiant").fill(identity);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(new RegExp(`${next === "/" ? "/$" : `${next}$`}`));
}

export async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "défilement horizontal de page").toBeLessThanOrEqual(0);
}
