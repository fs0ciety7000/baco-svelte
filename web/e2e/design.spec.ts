import { expect, test, type Page } from "@playwright/test";

// Page /design dans chaque thème : pas de défilement horizontal, pas d'erreur console, captures
// (test-results/design-<thème>-<projet>.png) pour validation visuelle.

const identity = process.env.E2E_IDENTITY ?? "";
const password = process.env.E2E_PASSWORD ?? "";
test.skip(!identity || !password, "E2E_IDENTITY / E2E_PASSWORD non définis");

const THEMES = ["commandement", "ivoire", "rail", "contraste", "nocturne"] as const;

async function login(page: Page) {
  await page.goto("/connexion?suite=%2Fdesign");
  await page.getByLabel("E-mail ou identifiant").fill(identity);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/design$/);
}

for (const theme of THEMES) {
  test(`/design en thème ${theme}`, async ({ page, context }, testInfo) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));

    await login(page);
    await context.addCookies([
      {
        name: "csm_ui",
        value: JSON.stringify({ theme, density: "confortable" }),
        url: "http://localhost:3000",
      },
    ]);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bibliothèque CSM");
    // Laisse finir les entrées GSAP (≤ 0,5 s).
    await page.waitForTimeout(700);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "défilement horizontal de page").toBeLessThanOrEqual(0);

    await page.screenshot({
      path: `test-results/design-${theme}-${testInfo.project.name}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}

test("les cibles tactiles font au moins 44 px sur mobile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile uniquement");
  await login(page);
  const small = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "main button, main [role=radio], main input, main select",
      ),
    ]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ el: el.outerHTML.slice(0, 80), h: el.getBoundingClientRect().height }))
      .filter((x) => x.h < 43.5),
  );
  expect(small).toEqual([]);
});
