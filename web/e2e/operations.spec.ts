import { expect, test, type Page } from "@playwright/test";

import { identity, login, noHorizontalScroll, password } from "./helpers";

// Module Opérations : trains en direct (iRail simulé : e2e/mock-services.mjs), main courante (publication, « Lu »,
// correction, pièce jointe, retrait), carte PN (PN de démo), statistiques, cloche ; captures desktop + mobile
// (Commandement, Ivoire). Données fictives créées par le superuser et supprimées à la fin.

const PB = (process.env.PB_URL ?? "http://127.0.0.1:8090").replace(/\/$/, "");
const suEmail = process.env.PB_SUPERUSER_EMAIL ?? "";
const suPassword = process.env.PB_SUPERUSER_PASSWORD ?? "";
test.skip(!identity || !password || !suEmail, "E2E_IDENTITY / PB_SUPERUSER_* non définis");
test.describe.configure({ mode: "serial" });

let root = "";
let agentId = "";
const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
const MARK = `E2E-${suffix}`;
const fixtures: { col: string; id: string }[] = [];

async function pb(method: string, path: string, body?: unknown) {
  const res = await fetch(`${PB}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(root ? { authorization: root } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.status === 204 ? null : res.json();
}

// PNG 1×1 valide (pièce jointe de test).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test.beforeAll(async () => {
  root = (
    await pb("POST", "/api/collections/_superusers/auth-with-password", {
      identity: suEmail,
      password: suPassword,
    })
  ).token;
  const agent = await pb(
    "GET",
    `/api/collections/users/records?filter=${encodeURIComponent(`email="${identity}"`)}`,
  );
  agentId = agent.items[0].id;
  // Préférences propres (pas de gare favorite au départ).
  await pb("PATCH", `/api/collections/users/records/${agentId}`, { preferences: {} });
  const pn = await pb("POST", "/api/collections/level_crossings/records", {
    line: "L.999",
    number: "7 bis",
    bk: 12.345,
    address: `Rue de l'Essai ${suffix}, 7000 Mons`,
    lat: 50.4557,
    lon: 3.9395,
    zone: "FMS",
    active: true,
    source: "csm",
  });
  fixtures.push({ col: "level_crossings", id: pn.id });
});

test.afterAll(async () => {
  const entries = await pb(
    "GET",
    `/api/collections/ops_log/records?perPage=100&filter=${encodeURIComponent(`body~"${MARK}"`)}`,
  );
  for (const e of entries?.items ?? [])
    await pb("DELETE", `/api/collections/ops_log/records/${e.id}`);
  const notes = await pb(
    "GET",
    `/api/collections/notifications/records?perPage=100&filter=${encodeURIComponent(`user="${agentId}"`)}`,
  );
  for (const n of notes?.items ?? [])
    await pb("DELETE", `/api/collections/notifications/records/${n.id}`);
  const watches = await pb(
    "GET",
    `/api/collections/train_watches/records?perPage=100&filter=${encodeURIComponent(`user="${agentId}"`)}`,
  );
  for (const w of watches?.items ?? [])
    await pb("DELETE", `/api/collections/train_watches/records/${w.id}`);
  await pb("PATCH", `/api/collections/users/records/${agentId}`, { preferences: {} });
  for (const f of fixtures.reverse())
    await pb("DELETE", `/api/collections/${f.col}/records/${f.id}`);
});

test("trains en direct : gare, favori, train, bus de substitution, suivi", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "parcours en desktop ; mobile en captures");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "/operations");
  await page.getByTestId("live-search").fill("Mon");
  await page.getByTestId("live-suggestions").getByRole("button", { name: "Mons" }).click();
  await expect(page.getByTestId("live-station")).toHaveText("Mons");
  await expect(page.getByTestId("live-board").locator("tr")).toHaveCount(12);
  await expect(page.getByTestId("live-board")).toContainText("Supprimé");
  await page.getByTestId("live-favorite").click();
  await expect(page.getByRole("button", { name: /Mons/ }).first()).toBeVisible();
  await page
    .getByRole("button", { name: /Ouvrir le train IC/ })
    .first()
    .click();
  const panel = page.getByTestId("train-panel");
  await expect(panel).toContainText("Bruxelles-Midi");
  await expect(panel).toContainText("Section PMR");
  const bus = page.getByRole("link", { name: "Bus de substitution" });
  await expect(bus).toHaveAttribute(
    "href",
    /\/commandes\/nouveau\?origine=Bruxelles-Midi&destination=Tournai/,
  );
  await page.getByTestId("train-watch").click();
  await expect(page.getByTestId("train-watch")).toContainText("Ne plus suivre");
  await page.getByTestId("train-watch").click();
  await expect(page.getByTestId("train-watch")).toContainText("Suivre");
  // Numéro de train tapé directement.
  await page.keyboard.press("Escape");
  await page.getByTestId("live-search").fill("ic 2113");
  await page.getByTestId("live-search").press("Enter");
  await expect(page.getByTestId("train-panel")).toBeVisible();
  await expect(page).toHaveURL(/train=IC2113/);
  // Pré-remplissage du bon de commande bus.
  await page.goto("/commandes/nouveau?origine=Mons&destination=Tournai&relation=IC%202113");
  await expect(page.getByRole("combobox", { name: "Origine", exact: true })).toHaveValue("Mons");
  expect(errors).toEqual([]);
});

test("journal : publier (Markdown), lu, corriger, pièce jointe, retirer", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "parcours en desktop");
  await login(page, "/operations/journal");
  // Districts du jour : bandeau du matin (non bloquant), puis puce dans l'en-tête du Journal.
  const banner = page.getByTestId("duty-banner");
  // Le bandeau apparaît après l'hydratation (choix « Plus tard » lu dans le navigateur) : on l'attend.
  const shown = await banner
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (shown) {
    // Le district du profil est pré-coché : on ne clique que si DSO ne l'est pas déjà.
    const dso = banner.getByRole("checkbox", { name: /DSO/ });
    if ((await dso.getAttribute("aria-checked")) !== "true") await dso.click();
    await expect(dso).toHaveAttribute("aria-checked", "true");
    await banner.getByTestId("duty-save").click();
    await expect(banner).toBeHidden();
  }
  await expect(page.getByTestId("duty-chip")).toContainText("DSO");
  await page.getByRole("radio", { name: "Incident" }).click();
  await page.getByTestId("log-body").fill(`${MARK} **dérangement** de signalisation à Jurbise 🚨`);
  await page.getByTestId("log-options-toggle").click();
  await page.getByLabel("Train (facultatif)").fill("ic 2134");
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG });
  await page.getByTestId("log-submit").click();
  const card = page.getByTestId("log-list").locator("article", { hasText: MARK });
  await expect(card).toBeVisible();
  await expect(card).toContainText("IC2134");
  await expect(card.locator("strong", { hasText: "dérangement" })).toBeVisible();
  // Le fil tient dans l'écran (défilement interne) et la barre d'écriture reste visible.
  await expect(page.getByTestId("log-body")).toBeInViewport();
  await expect(card.getByRole("img", { name: /Pièce jointe/ })).toBeVisible();
  // Son propre message : pas de bouton « Marquer lu ».
  await expect(card.getByTestId("log-read")).toHaveCount(0);
  // Réponse (fil) : citation du message d'origine et compteur de réponses.
  await card.getByTestId("log-reply").click();
  await expect(page.getByTestId("log-replying")).toBeVisible();
  await page.getByTestId("log-body").fill(`${MARK} réponse @DSO`);
  await page.getByTestId("log-submit").click();
  const answer = page.getByTestId("log-list").locator("article", { hasText: `${MARK} réponse` });
  await expect(answer.getByTestId("log-quote")).toBeVisible();
  await expect(card.getByTestId("log-replies")).toContainText("1");
  await card.getByTestId("log-open").click();
  await page.getByTestId("log-edit").click();
  await page
    .getByTestId("log-body")
    .last()
    .fill(`${MARK} dérangement de signalisation à Jurbise (corrigé)`);
  await page.getByTestId("log-submit").last().click();
  await expect(page.getByTestId("log-panel")).toContainText("Texte corrigé");
  await page.getByTestId("log-retire").click();
  await page.getByRole("dialog").getByLabel("Motif").fill("Doublon (essai)");
  await page.getByRole("dialog").getByRole("button", { name: "Retirer" }).click();
  await expect(page.getByTestId("log-panel")).toContainText("Retirée");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("log-list").locator("article", { hasText: MARK })).toHaveCount(0);
});

test("carte PN : recherche, fiche, itinéraire, tuiles relayées", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "parcours en desktop");
  const tiles: number[] = [];
  page.on("response", (r) => r.url().includes("/api/operations/tuiles/") && tiles.push(r.status()));
  await login(page, "/operations/carte-pn");
  await page.getByTestId("pn-search").fill("7 bis L.999");
  await expect(page.getByTestId("pn-count")).toContainText("1");
  await page.getByRole("button", { name: "Ouvrir le PN 7 bis de la L.999" }).click();
  await expect(page.getByTestId("pn-panel")).toContainText("12.345");
  await expect(page.getByTestId("pn-route")).toHaveAttribute(
    "href",
    /destination=50\.4557,3\.9395/,
  );
  await expect.poll(() => tiles.length).toBeGreaterThan(0);
  expect(tiles.every((s) => s === 200)).toBe(true);
});

test("cloche et statistiques", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "parcours en desktop");
  await pb("POST", "/api/collections/notifications/records", {
    user: agentId,
    kind: "systeme",
    title: `Notification ${MARK}`,
    link: "/operations/statistiques",
  });
  await login(page, "/operations/journal");
  await expect(page.getByTestId("bell")).toHaveAccessibleName(/1 non lue/);
  await page.getByTestId("bell").click();
  await page.getByTestId("bell-menu").getByText(`Notification ${MARK}`).click();
  await expect(page).toHaveURL(/\/operations\/statistiques/);
  await expect(page.getByTestId("stats-cards")).toContainText("Commandes bus");
  await expect(page.getByTestId("bell")).toHaveAccessibleName("Notifications");
});

async function snap(page: Page, name: string, project: string, full = true) {
  await page.waitForTimeout(600);
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/operations-${name}-${project}.png`, fullPage: full });
}

for (const t of ["commandement", "ivoire"] as const) {
  test(`captures ${t}`, async ({ page, context }, info) => {
    await login(page);
    await context.addCookies([
      {
        name: "csm_ui",
        value: JSON.stringify({ theme: t, density: "confortable" }),
        url: "http://localhost:3000",
      },
    ]);
    const p = info.project.name;
    await page.goto("/operations?gare=BE.NMBS.008881000&nom=Mons");
    await expect(page.getByTestId(p === "desktop" ? "live-board" : "live-cards")).toBeVisible();
    await snap(page, `${t}-trains`, p, false);
    await page.goto("/operations?gare=BE.NMBS.008881000&nom=Mons&train=IC2100");
    await expect(page.getByTestId("train-panel")).toBeVisible();
    await snap(page, `${t}-train-panneau`, p, false);
    await page.goto("/operations/journal");
    await expect(page.getByTestId("journal")).toBeVisible();
    await snap(page, `${t}-journal`, p, false);
    await page.goto("/operations/carte-pn?q=L.999");
    await snap(page, `${t}-carte-pn`, p, false);
    await page.goto("/operations/statistiques");
    await snap(page, `${t}-statistiques`, p);
  });
}
