import { expect, type Locator, type Page } from "@playwright/test";

export const identity = process.env.E2E_IDENTITY ?? "";
export const password = process.env.E2E_PASSWORD ?? "";

export async function login(page: Page, next = "/") {
  await page.goto(`/connexion${next === "/" ? "" : `?suite=${encodeURIComponent(next)}`}`);
  await page.getByLabel("E-mail ou identifiant").fill(identity);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${next === "/" ? "/$" : `${next}$`}`));
}

export async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "défilement horizontal de page").toBeLessThanOrEqual(0);
}

/**
 * Champs date personnalisés (refonte R3) : la date s'affiche et se tape en `jj/mm/aaaa` (valeur ISO dans le champ
 * caché). `frDate("2026-10-14")` → « 14/10/2026 », pour `fill` ou `toHaveValue` sur un DateField.
 */
export function frDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Listes personnalisées (refonte R1 / R5) : plus de `<select>` natif, donc plus de `selectOption`. Ouvre le combobox
 * nommé `label` (libellé du champ, `aria-label`, ou un `Locator` déjà ciblé) puis choisit l'option `option` (texte exact
 * ou motif). Marche en desktop (Popover) comme en mobile (feuille du bas) : l'option est cherchée dans la liste ouverte.
 */
export async function chooseOption(
  page: Page,
  label: string | RegExp | Locator,
  option: string | RegExp,
) {
  const trigger =
    typeof label === "string" || label instanceof RegExp
      ? page
          .getByRole("combobox", {
            name: label,
            ...(typeof label === "string" ? { exact: true } : {}),
          })
          .filter({ visible: true })
          .first()
      : label;
  await trigger.click();
  const list = page.getByRole("listbox").filter({ visible: true }).last();
  await list
    .getByRole("option", { name: option, ...(typeof option === "string" ? { exact: true } : {}) })
    .click();
  await expect(list).toBeHidden();
}
