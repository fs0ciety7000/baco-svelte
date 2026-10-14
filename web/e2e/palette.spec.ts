import { expect, test, type Page } from "@playwright/test";

import { login, noHorizontalScroll } from "./helpers";

// Palette ⌘K granulaire (14 oct. 2026) : groupes par module (Ressources › Gares, Lignes, Relations, Trains…), lecture de
// la saisie (« IC96 » = relation, « L.996 » = ligne, 5 chiffres = n° de train, « ZPQ » = abréviation de gare). Données
// fictives écrites par le superuser (une par format : les deux projets tournent en parallèle), supprimées à la fin.

const PB = process.env.PB_URL ?? "http://127.0.0.1:8090";
const SU = {
  identity: process.env.PB_SUPERUSER_EMAIL ?? "",
  password: process.env.PB_SUPERUSER_PASSWORD ?? "",
};
test.skip(!SU.identity || !process.env.E2E_IDENTITY, "superuser / agent E2E non définis");
test.describe.configure({ mode: "serial" });

let token = "";
const created: { col: string; id: string }[] = [];

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

let REL = "IC96";
let TRAIN = 99961;
let LINE = "996";
let ABBR = "ZPQ";
let STATION = "Palette E2E desktop";

test.beforeAll(async ({}, info) => {
  if (info.project.name !== "desktop")
    [REL, TRAIN, LINE, ABBR, STATION] = ["IC95", 99951, "995", "ZPR", "Palette E2E mobile"];
  token = (await pb("POST", "/api/collections/_superusers/auth-with-password", SU)).token;
  const key = STATION.toLowerCase();
  // Restes d'un passage interrompu (clés fixes).
  for (const [col, filter] of [
    ["train_services", `key="${TRAIN}:e2e-palette"`],
    ["train_relations", `key="${REL}"`],
    ["rail_lines", `line="${LINE}"`],
    ["stations", `key="${key}"`],
    ["bus_companies", `name="Transports ${STATION}"`],
  ]) {
    const old = await pb(
      "GET",
      `/api/collections/${col}/records?perPage=50&filter=${encodeURIComponent(filter!)}`,
    );
    for (const r of old?.items ?? []) await pb("DELETE", `/api/collections/${col}/records/${r.id}`);
  }
  const stops = [
    { n: STATION, d: "06:11", l: LINE },
    { n: "Soignies", t: "Zinnik", a: "06:40", l: LINE },
  ];
  const add = async (col: string, body: unknown) =>
    created.push({ col, id: (await pb("POST", `/api/collections/${col}/records`, body)).id });
  await add("stations", {
    key,
    name: STATION,
    abbr: ABBR,
    country: "BE",
    district: "DSO",
    kind: "gare",
    served: true,
    lines: [LINE],
    aliases: [],
    search_key: `|${key}|${ABBR.toLowerCase()}|`,
  });
  await add("bus_companies", { name: `Transports ${STATION}`, phone: "065 00 00 01" });
  await add("rail_lines", {
    line: LINE,
    name: `${STATION} – Soignies`,
    stations: [{ n: STATION, a: ABBR }, { n: "Soignies" }],
    branches: [],
    count: 2,
  });
  await add("train_relations", {
    key: REL,
    relation: REL,
    type: "IC",
    label: `${STATION} – Soignies`,
    variants: [{ from: STATION, to: "Soignies", trains: 1, days: 31 }],
    series: [],
    lines: [LINE],
    numbers: [TRAIN],
    pattern: stops,
    trains: 1,
    days: 31,
    stations_key: `|${key}|soignies|zinnik|`,
    lines_key: `|${LINE}|`,
  });
  await add("train_services", {
    key: `${TRAIN}:e2e-palette`,
    number: TRAIN,
    type: "IC",
    relation: REL,
    relation_source: "infrabel",
    origin: STATION,
    terminus: "Soignies",
    days: 31,
    stops,
    lines: [LINE],
    first_dep: "06:11",
    last_arr: "06:40",
    stations_key: `|${key}|soignies|zinnik|`,
    pass_key: "",
    lines_key: `|${LINE}|`,
  });
});

test.afterAll(async () => {
  for (const c of created.reverse())
    await pb("DELETE", `/api/collections/${c.col}/records/${c.id}`).catch(() => undefined);
});

async function openPalette(page: Page, isMobile: boolean) {
  await page
    .getByRole("button", { name: isMobile ? "Rechercher" : "Rechercher, aller à", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Palette de commandes" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("relation « IC96 » : groupe Ressources › Relations en tête", async ({ page, isMobile }) => {
  await login(page);
  const dialog = await openPalette(page, isMobile);
  await dialog.getByRole("combobox").fill(REL);
  const group = dialog.getByTestId("palette-group-relations");
  await expect(group).toContainText("Ressources › Relations");
  const option = group.getByRole("option", { name: new RegExp(`${REL} · ${STATION}`) });
  await expect(option).toBeVisible();
  // Premier groupe affiché : la relation (lecture de la saisie).
  await expect(dialog.locator("[cmdk-group]").first()).toHaveAttribute(
    "data-testid",
    "palette-group-relations",
  );
  await option.click();
  await expect(page).toHaveURL(new RegExp(`/referentiels/trains\\?rel=${REL}`));
});

test("n° de train : trains en direct et référentiel des trains", async ({ page, isMobile }) => {
  await login(page);
  const dialog = await openPalette(page, isMobile);
  await dialog.getByRole("combobox").fill(String(TRAIN));
  await expect(
    dialog.getByTestId("palette-group-live").getByRole("option", { name: `Train ${TRAIN}` }),
  ).toBeVisible();
  await expect(
    dialog
      .getByTestId("palette-group-trains")
      .getByRole("option", { name: new RegExp(`Train ${TRAIN} · ${STATION} → Soignies`) }),
  ).toBeVisible();
});

test("ligne « L.996 » et gare par abréviation", async ({ page, isMobile }) => {
  await login(page);
  const dialog = await openPalette(page, isMobile);
  const input = dialog.getByRole("combobox");
  await input.fill(`L.${LINE}`);
  await expect(
    dialog
      .getByTestId("palette-group-lines")
      .getByRole("option", { name: new RegExp(`L\\.${LINE} · ${STATION}`) }),
  ).toBeVisible();
  await input.fill(ABBR);
  const station = dialog
    .getByTestId("palette-group-stations")
    .getByRole("option", { name: new RegExp(STATION) });
  await expect(station).toBeVisible();
  // Le premier résultat du groupe le plus probable est actif (Entrée l'ouvre), pas un reste de la saisie précédente.
  await expect(station).toHaveAttribute("aria-selected", "true");
  // Ma journée à la gare trouvée (Opérations).
  await expect(
    dialog.getByTestId("palette-group-journee").getByRole("option", { name: /Ma journée à/ }),
  ).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/palette-${isMobile ? "390" : "1440"}.png` });
  await station.click();
  await expect(page).toHaveURL(/\/referentiels\/trains\?vue=gare&gare=Palette/);
});

test("fournisseur et agent de l'équipe", async ({ page, isMobile }) => {
  await login(page);
  const dialog = await openPalette(page, isMobile);
  const input = dialog.getByRole("combobox");
  await input.fill(`Transports ${STATION}`);
  const suppliers = dialog.getByTestId("palette-group-suppliers");
  await expect(suppliers).toContainText("Commandes › Fournisseurs");
  const supplier = suppliers.getByRole("option", { name: new RegExp(`Transports ${STATION}`) });
  await expect(supplier).toBeVisible();
  // Agent E2E : annuaire de l'équipe (champs de l'annuaire seulement).
  await input.fill("Agent E2E");
  await expect(
    dialog
      .getByTestId("palette-group-team")
      .getByRole("option", { name: /Agent E2E/ })
      .first(),
  ).toBeVisible();
  await input.fill(`Transports ${STATION}`);
  await supplier.click();
  await expect(page).toHaveURL(/\/commandes\/fournisseurs\?type=bus&q=Transports/);
});
