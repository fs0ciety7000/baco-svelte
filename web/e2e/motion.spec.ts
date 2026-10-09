import { expect, test } from "@playwright/test";

import { identity, login, password } from "./helpers";

// Mouvement (audit motion du 9 oct. 2026, lot 0) : dialogues sans glissement latéral, aucune boucle d'animation
// hors indicateur « en direct », accueil sans flash au chargement, filtres sans rechargement de page.

test.skip(!identity || !password, "E2E_IDENTITY / E2E_PASSWORD non définis");

test("la palette ⌘K s'ouvre sans glisser en diagonale", async ({ page, isMobile }) => {
  test.skip(isMobile, "raccourci clavier : desktop");
  await login(page);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Palette de commandes" });
  await dialog.waitFor();
  const lefts = await dialog.evaluate(async (el) => {
    const out: number[] = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 300) {
      out.push(el.getBoundingClientRect().left);
      await new Promise((r) => requestAnimationFrame(r));
    }
    return out;
  });
  expect(Math.max(...lefts) - Math.min(...lefts)).toBeLessThanOrEqual(2);
});

test("aucune animation infinie hors « en direct » et chargement", async ({ page }) => {
  await login(page);
  await page.waitForTimeout(1200);
  const loops = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.effect?.getTiming().iterations === Infinity)
      .map((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target as Element | null;
        return target?.getAttribute("class") ?? "";
      })
      .filter((cls) => !/animate-pulse-dot|animate-spin|live-dot/.test(cls)),
  );
  expect(loops).toEqual([]);
});

test("l'accueil ne clignote pas au premier affichage", async ({ page }) => {
  await login(page);
  await page.evaluate(() => {
    const w = window as unknown as { __minOpacity: number };
    w.__minOpacity = 1;
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __minOpacity: number };
    w.__minOpacity = 1;
    let seen = false;
    const tick = () => {
      const el = document.querySelector<HTMLElement>("[data-widget]");
      if (el) {
        const o = Number(getComputedStyle(el).opacity);
        if (o > 0.99) seen = true;
        else if (seen) w.__minOpacity = Math.min(w.__minOpacity, o);
      }
      if (performance.now() < 4000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.reload();
  await page.locator("[data-widget]").first().waitFor();
  await page.waitForTimeout(1200);
  const min = await page.evaluate(
    () => (window as unknown as { __minOpacity: number }).__minOpacity,
  );
  expect(min, "un widget visible a été masqué puis réaffiché").toBeGreaterThan(0.99);
});

test("changer un filtre ne recharge pas la page", async ({ page }) => {
  await login(page);
  await page.goto("/equipe");
  await page.evaluate(() => {
    (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
  });
  await page.locator('select[name="district"]').selectOption({ index: 1 });
  await expect(page).toHaveURL(/district=/);
  const same = await page.evaluate(
    () => (window as unknown as { __sameDocument?: boolean }).__sameDocument === true,
  );
  expect(same, "navigation côté client attendue (next/form)").toBe(true);
});
