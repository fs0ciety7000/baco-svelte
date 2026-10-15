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
      // Premier widget visible (« Fin de service » quitte la grille dès 1280 px : colonne droite, v4 lot 4).
      const el = [...document.querySelectorAll<HTMLElement>("[data-widget]")].find(
        (w) => w.offsetParent !== null,
      );
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
  await page.locator("[data-widget]").filter({ visible: true }).first().waitFor();
  await page.waitForTimeout(1200);
  const min = await page.evaluate(
    () => (window as unknown as { __minOpacity: number }).__minOpacity,
  );
  expect(min, "un widget visible a été masqué puis réaffiché").toBeGreaterThan(0.99);
});

// Lot 5 (15 oct. 2026) : arrivée de page en CSS (`.motion-enter`, retirée à la fin), rien en mouvement réduit, et GSAP
// hors du bundle des pages qui ne l'utilisent pas.
async function watchEnter(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __enter: string[] };
    w.__enter = [];
    new MutationObserver(() => {
      for (const el of document.querySelectorAll(".motion-enter"))
        w.__enter.push(el.hasAttribute("data-page-body") ? "page-body" : el.tagName);
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  });
}

test("l'arrivée de page est jouée en CSS puis retirée", async ({ page }) => {
  await login(page);
  await page.goto("/reseau");
  await watchEnter(page);
  await page.locator('a[href="/reseau/ptcar"]').filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/reseau\/ptcar/);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __enter: string[] }).__enter))
    .toContain("page-body");
  // 320 ms + marge : plus aucune classe ni animation d'entrée en cours.
  await page.waitForTimeout(700);
  expect(await page.locator(".motion-enter").count()).toBe(0);
});

test("aucune arrivée animée en mouvement réduit", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  await page.goto("/reseau");
  await watchEnter(page);
  await page.locator('a[href="/reseau/ptcar"]').filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/reseau\/ptcar/);
  await page.waitForTimeout(500);
  const seen = await page.evaluate(() => (window as unknown as { __enter: string[] }).__enter);
  expect(seen).toEqual([]);
});

test("GSAP n'est pas chargé par le shell (bon bus)", async ({ page }) => {
  await login(page);
  await page.goto("/commandes/nouveau");
  await page.getByTestId("bus-company").waitFor();
  // GSAP déclare `window.gsapVersions` à son chargement ; le shell (barre, onglets, transitions) n'en dépend plus.
  const loaded = await page.evaluate(
    () => !!(window as unknown as { gsapVersions?: string[] }).gsapVersions,
  );
  expect(loaded, "GSAP chargé sur une page qui ne l'utilise pas").toBe(false);
});

test("changer un filtre ne recharge pas la page", async ({ page }) => {
  await login(page);
  await page.goto("/ressources/equipe");
  await page.evaluate(() => {
    (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
  });
  // Districts en menu (v4 lot 6, DistrictMenu) : le filtre part à la fermeture du menu.
  await page.getByTestId("district-picker").click();
  await page.getByTestId("district-picker-list").getByRole("button", { name: /DSO/ }).click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/district=/);
  const same = await page.evaluate(
    () => (window as unknown as { __sameDocument?: boolean }).__sameDocument === true,
  );
  expect(same, "navigation côté client attendue (next/form)").toBe(true);
});
