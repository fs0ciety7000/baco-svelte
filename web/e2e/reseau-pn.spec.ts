import { expect, test } from "@playwright/test";

import { adminIdentity, login, loginAdmin, noHorizontalScroll } from "./helpers";

// Réseau › Carte PN refaite, fiche d'une ligne avec ses PN, Administration › Zones SPI (15 oct. 2026). Données fictives
// écrites par le superuser (ligne 996 / 995 selon le format, PN « Infrabel » et repris de BACO, gare de test), supprimées
// à la fin. L'import réel (opendata.infrabel.be) n'est pas joué ici. `SHOTS=<dossier>` : captures d'écran.

const PB = process.env.PB_URL ?? "http://127.0.0.1:8090";
const SU = {
  identity: process.env.PB_SUPERUSER_EMAIL ?? "",
  password: process.env.PB_SUPERUSER_PASSWORD ?? "",
};
test.skip(!SU.identity || !process.env.E2E_IDENTITY, "superuser / agent E2E non définis");
test.describe.configure({ mode: "serial" });

let token = "";
const created: { col: string; id: string }[] = [];
let LN = "996";
const ids: Record<string, string> = {};

async function pb(method: string, path: string, body?: unknown) {
  const res = await fetch(`${PB}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 404)
    throw new Error(`${method} ${path} : ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const shot = async (page: import("@playwright/test").Page, name: string, project: string) => {
  if (!process.env.SHOTS) return;
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${process.env.SHOTS}/${name}-${project}.png` });
};

test.beforeAll(async ({}, info) => {
  if (info.project.name !== "desktop") LN = "995";
  token = (await pb("POST", "/api/collections/_superusers/auth-with-password", SU)).token;
  for (const [col, filter] of [
    ["level_crossings", `line="L.${LN}"`],
    ["stations", `key="zone e2e ${info.project.name}"`],
  ]) {
    const r = await pb(
      "GET",
      `/api/collections/${col}/records?perPage=50&filter=${encodeURIComponent(filter!)}`,
    );
    for (const it of r?.items ?? []) await pb("DELETE", `/api/collections/${col}/records/${it.id}`);
  }
  const mk = async (col: string, body: Record<string, unknown>) => {
    const r = await pb("POST", `/api/collections/${col}/records`, body);
    created.push({ col, id: r.id });
    return r.id as string;
  };
  ids.far = await mk("level_crossings", {
    line: `L.${LN}`,
    number: "12A",
    bk: 41.3,
    bk_estimated: true,
    lat: 50.47,
    lon: 3.98,
    zone: "FMS",
    zone_source: "auto",
    commune: "7000 Mons",
    signal: "Signalisation active fermeture partielle",
    infrabel_id: `L-${LN}-12A`,
    source: "infrabel",
    active: true,
  });
  ids.near = await mk("level_crossings", {
    line: `L.${LN}`,
    number: "3 bis",
    bk: 12.345,
    address: `Rue du Passage e2e ${LN}`,
    lat: 50.45,
    lon: 3.95,
    zone: "FMS",
    zone_source: "baco",
    source: "baco",
    active: true,
  });
  ids.station = await mk("stations", {
    key: `zone e2e ${info.project.name}`,
    name: `Gare zone e2e ${info.project.name}`,
    country: "BE",
    kind: "gare",
    lat: 50.46,
    lon: 3.96,
    lines: [LN],
    spi_zone: "FMS",
    spi_zone_source: "carte",
  });
});

test.afterAll(async () => {
  for (const c of created.reverse())
    await pb("DELETE", `/api/collections/${c.col}/records/${c.id}`).catch(() => {});
});

test("carte PN : filtres, liste, fiche, couche zones SPI", async ({ page }, info) => {
  test.setTimeout(90_000);
  const p = info.project.name;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const zonesReq: number[] = [];
  page.on(
    "response",
    (r) => r.url().includes("/api/reseau/zones-spi") && zonesReq.push(r.status()),
  );
  await login(page, "/reseau/pn");
  await page.goto(`/reseau/pn?ligne=L.${LN}`);
  await expect(page.getByTestId("pn-count")).toContainText("2");
  // Tri par numéro : « 3 bis » avant « 12A ».
  const items = page.getByTestId("pn-list").getByRole("button");
  await expect(items.first()).toHaveAccessibleName(`Ouvrir le PN 3 bis de la L.${LN}`);
  await noHorizontalScroll(page);
  await shot(page, "pn-liste", p);

  // District : FMS est en DSO → rien en DSE.
  await page.goto(`/reseau/pn?ligne=L.${LN}&district=DSE`);
  await expect(page.getByTestId("pn-count")).toContainText("0");
  await page.goto(`/reseau/pn?ligne=L.${LN}&district=DSO&zone=FMS`);
  await expect(page.getByTestId("pn-count")).toContainText("2");

  // Recherche par commune, puis fiche du PN Infrabel.
  await page.goto("/reseau/pn");
  await page.getByTestId("pn-search").fill(`L-${LN}-12A`);
  await expect(page.getByTestId("pn-count")).toContainText("1");
  await page.getByRole("button", { name: `Ouvrir le PN 12A de la L.${LN}` }).click();
  const panel = page.getByTestId("pn-panel");
  await expect(panel).toContainText("≈ 41.3");
  await expect(panel).toContainText("7000 Mons");
  await expect(panel).toContainText("Signalisation active fermeture partielle");
  await expect(panel).toContainText("Données ouvertes Infrabel");
  await expect(panel).toContainText("FMS");
  await expect(page.getByTestId("pn-route")).toHaveAttribute("href", /destination=50\.47,3\.98/);
  await shot(page, "pn-fiche", p);
  await page.keyboard.press("Escape");

  // Couche « Zones SPI » : chargée à la demande, légende affichée.
  await page.goto(`/reseau/pn?zones=1${p === "mobile" ? "&vue=carte" : ""}`);
  await expect(page.getByTestId("pn-zone-legend")).toContainText("FMS");
  await expect.poll(() => zonesReq.length).toBeGreaterThan(0);
  expect(zonesReq.every((s) => s === 200)).toBe(true);
  await expect(page.getByTestId("pn-map")).toBeVisible();
  await page.waitForTimeout(800);
  await noHorizontalScroll(page);
  await shot(page, "pn-carte-zones", p);
  expect(errors).toEqual([]);
});

test("fiche d'une ligne : PN dans l'ordre des BK, lien vers la carte", async ({ page }, info) => {
  await login(page, "/reseau/lignes");
  await page.goto(`/reseau/lignes?ligne=${LN}`);
  const sec = page.getByTestId("line-crossings");
  await sec.locator("summary").click();
  const links = sec.getByRole("link", { name: /^PN .* sur la carte$/ });
  await expect(links).toHaveCount(2);
  await expect(links.first()).toContainText("12.345");
  await expect(links.nth(1)).toContainText("≈ 41.3");
  await noHorizontalScroll(page);
  await shot(page, "ligne-pn", info.project.name);
  await links.first().click();
  await expect(page).toHaveURL(new RegExp(`/reseau/pn\\?pn=${ids.near}`));
  await expect(page.getByTestId("pn-panel")).toContainText(`Rue du Passage e2e ${LN}`);
});

test("administration : zones SPI, zone d'une gare choisie à la main", async ({ page }, info) => {
  test.skip(!adminIdentity, "compte admin E2E non défini");
  const p = info.project.name;
  await loginAdmin(page, "/admin/referentiels/zones-spi");
  await page.goto("/admin/referentiels/zones-spi");
  await expect(page.getByTestId("zones-map")).toBeVisible();
  await expect(page.getByRole("button", { name: "Modifier la zone FMS" })).toBeVisible();
  await noHorizontalScroll(page);
  await shot(page, "admin-zones-carte", p);
  await page.getByTestId("zones-search").fill(`Gare zone e2e ${p}`);
  await expect(page.getByTestId("zones-count")).toContainText("1");
  await noHorizontalScroll(page);
  await shot(page, "admin-zones", p);
  await page.getByLabel(`Zone de Gare zone e2e ${p}`).last().selectOption("FCR");
  await expect
    .poll(async () => {
      const r = await pb("GET", `/api/collections/stations/records/${ids.station}`);
      return `${r.spi_zone}/${r.spi_zone_source}`;
    })
    .toBe("FCR/manuel");
  await page.getByLabel(`Zone de Gare zone e2e ${p}`).last().selectOption("auto");
  await expect
    .poll(
      async () =>
        (await pb("GET", `/api/collections/stations/records/${ids.station}`)).spi_zone_source,
    )
    .not.toBe("manuel");
});
