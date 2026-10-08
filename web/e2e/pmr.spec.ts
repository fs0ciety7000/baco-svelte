import { expect, test, type Page } from "@playwright/test";

import { identity, login, noHorizontalScroll, password } from "./helpers";

// Module PMR : prestation collée depuis DICOS (aller-retour = 2 prestations), panneau, annulation avec motif,
// matériel (changement d'état), clients (doublon signalé), captures desktop + mobile (Commandement, Ivoire).
// Données fictives créées par le superuser et supprimées à la fin.

const PB = (process.env.PB_URL ?? "http://127.0.0.1:8090").replace(/\/$/, "");
const suEmail = process.env.PB_SUPERUSER_EMAIL ?? "";
const suPassword = process.env.PB_SUPERUSER_PASSWORD ?? "";
test.skip(!identity || !password || !suEmail, "E2E_IDENTITY / PB_SUPERUSER_* non définis");
test.describe.configure({ mode: "serial" });

let root = "";
const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
const STATION = `XT${suffix}`;
const CLIENT = `Exemple${suffix}`;
const fixtures: { col: string; id: string }[] = [];
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());

async function pb(method: string, path: string, body?: unknown) {
  const res = await fetch(`${PB}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(root ? { authorization: root } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.status === 204 ? null : res.json();
}

test.beforeAll(async () => {
  root = (
    await pb("POST", "/api/collections/_superusers/auth-with-password", {
      identity: suEmail,
      password: suPassword,
    })
  ).token;
  const zone = await pb("POST", "/api/collections/pmr_zones/records", {
    code: `Z${suffix}`,
    label: "Zone démo",
    district: "Sud-Ouest",
    stations: [STATION],
  });
  fixtures.push({ col: "pmr_zones", id: zone.id });
  const eq = await pb("POST", "/api/collections/pmr_equipment/records", {
    station: STATION,
    platform: "1",
    zone: zone.id,
    state: "ok",
    assistance: "full",
    valid_until: "2020-01-31",
  });
  fixtures.push({ col: "pmr_equipment", id: eq.id });
  const client = await pb("POST", "/api/collections/pmr_clients/records", {
    last_name: CLIENT,
    first_name: "Client",
    phone: "0470 00 00 00",
    type: "CRF",
  });
  fixtures.push({ col: "pmr_clients", id: client.id });
  // Prestation de démo (captures mobiles : la base de la CI est vide).
  const agent = await pb(
    "GET",
    `/api/collections/users/records?filter=${encodeURIComponent(`email="${identity}"`)}`,
  );
  const a = await pb("POST", "/api/collections/pmr_assists/records", {
    day: today,
    time: "08:15",
    station: STATION,
    direction: "arrivee",
    train: "E1234",
    pax: 1,
    pmr_type: "NV",
    status: "prevue",
    created_by: agent.items[0].id,
    updated_by: agent.items[0].id,
  });
  fixtures.push({ col: "pmr_assists", id: a.id });
});

test.afterAll(async () => {
  const list = await pb(
    "GET",
    `/api/collections/pmr_assists/records?perPage=200&filter=${encodeURIComponent(`station="${STATION}"`)}`,
  );
  for (const a of list?.items ?? [])
    await pb("DELETE", `/api/collections/pmr_assists/records/${a.id}`);
  const cl = await pb(
    "GET",
    `/api/collections/pmr_clients/records?perPage=50&filter=${encodeURIComponent(`last_name~"${CLIENT}"`)}`,
  );
  for (const c of cl?.items ?? [])
    await pb("DELETE", `/api/collections/pmr_clients/records/${c.id}`);
  for (const f of fixtures.reverse())
    await pb("DELETE", `/api/collections/${f.col}/records/${f.id}`);
});

test("prestation collée depuis DICOS : aller-retour, panneau, annulation avec motif", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "parcours en desktop ; mobile en captures");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "/pmr/nouveau");
  await page
    .getByTestId("dicos-paste")
    .fill("1234-56-78-9012 1 CRF OUT E2134 à 16h42 Nom Fictif IN E5678 à 19h05");
  await expect(page.getByTestId("dicos-preview")).toContainText("1234-56-78-9012");
  await page.getByTestId("dicos-apply").click();
  // Deux prestations ; le nom collé n'est repris nulle part.
  await expect(page.getByRole("heading", { name: "Assistance 2" })).toBeVisible();
  await expect(page.locator("form")).not.toContainText("Nom Fictif");
  for (const field of await page.getByLabel("Gare").all()) await field.fill(STATION);
  await page.getByTestId("assist-save").click();
  await expect(page).toHaveURL(new RegExp(`/pmr\\?du=${today}`));

  const row = page.getByRole("button", { name: `Ouvrir la prestation de 16:42 à ${STATION}` });
  await row.click();
  await expect(page.getByTestId("assist-panel")).toContainText("1 × CRF");
  await expect(page.getByTestId("assist-panel")).toContainText(`Z${suffix}`);
  await page.getByTestId("assist-annulee").click();
  await page.getByLabel("Motif").fill("Train supprimé (essai)");
  await page.getByRole("dialog").getByRole("button", { name: "Annuler" }).last().click();
  await expect(page.getByTestId("assist-panel")).toContainText("Train supprimé (essai)");
  await expect(page.getByTestId("assist-panel")).toContainText("Prévue → Annulée");
  await page.getByTestId("assist-prevue").click();
  await expect(page.getByTestId("assist-panel")).toContainText("Annulée → Prévue");
  expect(errors).toEqual([]);
});

test("matériel : validité dépassée signalée, changement d'état tracé", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "parcours en desktop");
  await login(page, "/pmr/materiel");
  await page.goto(`/pmr/materiel?vue=validite&q=${STATION}`);
  await page.getByRole("button", { name: new RegExp(`Ouvrir la rampe ${STATION}`) }).click();
  await expect(page.getByTestId("equipment-panel")).toContainText("Dépassée");
  await page.getByTestId("equipment-state").click();
  await page.getByLabel("Motif / précision").fill("Charnière cassée (essai)");
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByTestId("equipment-panel")).toContainText("En service → Hors service");
});

test("clients : fiche liée, doublon signalé avant création", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "parcours en desktop");
  await login(page, "/pmr/clients");
  await page.goto(`/pmr/clients?q=${CLIENT}`);
  await expect(page.getByTestId("clients-table")).toContainText(CLIENT);
  await page.getByTestId("client-new").click();
  await page.getByRole("dialog").getByRole("textbox", { name: "Nom", exact: true }).fill(CLIENT);
  await page.getByTestId("client-save").click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Fiches proches");
  await page.keyboard.press("Escape");
});

async function snap(page: Page, name: string, project: string) {
  await page.waitForTimeout(500);
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/pmr-${name}-${project}.png`, fullPage: true });
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
    await page.goto("/pmr");
    await snap(page, `${t}-prestations`, p);
    await (
      p === "desktop"
        ? page.getByRole("button", { name: /Ouvrir la prestation/ }).first()
        : page.getByTestId("assists-cards").getByRole("button").first()
    ).click();
    await expect(page.getByTestId("assist-panel")).toBeVisible();
    await page.screenshot({ path: `test-results/pmr-${t}-prestation-panneau-${p}.png` });
    await page.keyboard.press("Escape");
    await page.goto("/pmr/nouveau");
    await snap(page, `${t}-nouvelle`, p);
    await page.goto("/pmr/materiel?vue=toutes");
    await snap(page, `${t}-materiel`, p);
    await page.goto("/pmr/clients");
    await snap(page, `${t}-clients`, p);
    await page.goto("/pmr/historique");
    await snap(page, `${t}-historique`, p);
  });
}
