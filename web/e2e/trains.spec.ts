import { expect, test } from "@playwright/test";

import { login, noHorizontalScroll } from "./helpers";

// Ressources › Trains (référentiel des relations, 14 oct. 2026). Données de test écrites par le superuser (relation
// fictive « IC98 » / « IC97 » selon le format, trains 998x1 / 998x2), supprimées à la fin ; l'import réel (GTFS +
// Infrabel) n'est pas joué ici.

const PB = process.env.PB_URL ?? "http://127.0.0.1:8090";
const SU = {
  identity: process.env.PB_SUPERUSER_EMAIL ?? "",
  password: process.env.PB_SUPERUSER_PASSWORD ?? "",
};
test.skip(!SU.identity || !process.env.E2E_IDENTITY, "superuser / agent E2E non définis");
// Un seul worker par format : les données de test sont partagées par les tests du fichier.
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

const stops = (pass = false) => [
  { n: "Quiévrain", d: "06:11", l: "97" },
  { n: "Saint-Ghislain", a: "06:27", d: "06:31", l: "97" },
  ...(pass ? [{ n: "Ghlin", a: "06:55", d: "06:55", p: 1, l: "96" }] : []),
  { n: "Mons", t: "Bergen", a: "06:45", d: "06:50", l: "96" },
  { n: "Soignies", t: "Zinnik", a: "07:08", l: "96" },
];

let REL = "IC98";
let N1 = 99801;
let N2 = 99802;
/** Ligne fictive de Ressources › Lignes. */
let LN = "998";

test.beforeAll(async ({}, info) => {
  // Les deux formats tournent en parallèle : données distinctes par projet.
  if (info.project.name !== "desktop") [REL, N1, N2, LN] = ["IC97", 99811, 99812, "997"];
  token = (await pb("POST", "/api/collections/_superusers/auth-with-password", SU)).token;
  // Restes d'un passage interrompu : supprimés d'abord (clés fixes).
  for (const [col, filter] of [
    ["train_services", `key="${N1}:e2e" || key="${N2}:e2e"`],
    ["train_relations", `key="${REL}"`],
    // Gare de CE format seulement : l'autre format tourne en parallèle (sa gare de test disparaissait).
    ["stations", `key="gare e2e ${info.project.name}"`],
    ["rail_lines", `line="${LN}"`],
    ["stations", `key="lignes e2e ${info.project.name}"`],
  ]) {
    const old = await pb(
      "GET",
      `/api/collections/${col}/records?perPage=50&filter=${encodeURIComponent(filter!)}`,
    );
    for (const r of old?.items ?? []) await pb("DELETE", `/api/collections/${col}/records/${r.id}`);
  }
  const svc = (number: number, days: number) => ({
    key: `${number}:e2e`,
    number,
    type: "IC",
    relation: REL,
    relation_source: "infrabel",
    series: "99800-99849",
    origin: "Quiévrain",
    terminus: "Soignies",
    days,
    stops: stops(true),
    lines: ["97", "96"],
    lines_source: "infrabel",
    first_dep: "06:11",
    last_arr: "07:08",
    stations_key: "|quievrain|saint ghislain|mons|bergen|soignies|zinnik|",
    pass_key: "|ghlin|",
    lines_key: "|97|96|",
  });
  for (const s of [svc(N1, 31), svc(N2, 96)]) {
    created.push({
      col: "train_services",
      id: (await pb("POST", "/api/collections/train_services/records", s)).id,
    });
  }
  const rel = await pb("POST", "/api/collections/train_relations/records", {
    key: REL,
    relation: REL,
    type: "IC",
    label: "Quiévrain – Soignies",
    variants: [{ from: "Quiévrain", to: "Soignies", trains: 2, days: 127 }],
    series: ["99800-99849"],
    lines: ["97", "96"],
    numbers: [N1, N2],
    pattern: stops(),
    trains: 2,
    days: 127,
    stations_key: "|quievrain|saint ghislain|mons|bergen|soignies|zinnik|",
    lines_key: "|97|96|",
  });
  created.push({ col: "train_relations", id: rel.id });
  // État d'import : seulement s'il n'existe pas (base de CI vide ; la base locale peut avoir un vrai import).
  const st = await pb(
    "GET",
    `/api/collections/app_settings/records?filter=${encodeURIComponent('key="timetable"')}`,
  );
  if (!st.items.length && info.project.name === "desktop") {
    const rec = await pb("POST", "/api/collections/app_settings/records", {
      key: "timetable",
      value: {
        state: "ok",
        lastOkAt: new Date().toISOString(),
        feedVersion: "2026-09-27",
        window: ["2026-10-14", "2026-10-20"],
      },
    });
    created.push({ col: "app_settings", id: rec.id });
  }
});

test.afterAll(async () => {
  for (const c of created.reverse())
    await pb("DELETE", `/api/collections/${c.col}/records/${c.id}`).catch(() => {});
});

test("relations, fiche, train, gare, ligne", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "/referentiels/trains");
  await page.goto(`/referentiels/trains?q=${REL}`);
  const p = info.project.name;
  const list =
    p === "desktop" ? page.getByTestId("relations-table") : page.locator("ul.md\\:hidden").first();
  await expect(list.getByText(REL)).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/trains-relations-${p}.png`, fullPage: true });

  await page.goto(`/referentiels/trains?rel=${REL}`);
  const detail = page.getByTestId("relation-detail");
  await expect(detail.getByText("Quiévrain – Soignies").first()).toBeVisible();
  await expect(detail.getByTestId("stop-list").getByText("Saint-Ghislain")).toBeVisible();
  await expect(detail.getByTestId("relation-trains").getByText(String(N1))).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/trains-relation-${p}.png`, fullPage: true });

  // Un n° de train dans la recherche ouvre sa fiche ; les passages sans arrêt y figurent.
  await page.goto(`/referentiels/trains?q=${N1}`);
  const train = page.getByTestId("train-detail");
  await expect(train.getByText("Ghlin (passage)")).toBeVisible();
  await expect(train.getByText("99800-99849")).toBeVisible();
  await noHorizontalScroll(page);

  // Par gare : nom NL accepté (Bergen = Mons), train à l'arrêt ; Ghlin : passage sans arrêt.
  await page.goto("/referentiels/trains?vue=gare&gare=Bergen&jours=tous");
  await expect(
    page.getByTestId("board-stops").getByText(String(N1)).filter({ visible: true }).first(),
  ).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/trains-gare-${p}.png`, fullPage: true });
  await page.goto("/referentiels/trains?vue=gare&gare=Ghlin&jours=semaine");
  await expect(
    page.getByTestId("board-passes").getByText(String(N1)).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(page.getByTestId("board-passes").getByText(String(N2))).toHaveCount(0);

  await page.goto("/referentiels/trains?vue=ligne&ligne=97&jours=tous");
  const line = page.getByTestId("line-board");
  await expect(line.getByText("Saint-Ghislain").filter({ visible: true }).first()).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/trains-ligne-${p}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("gares : recherche par alias, district modifiable", async ({ page }, info) => {
  const name = `Gare E2E ${info.project.name}`;
  const st = await pb("POST", "/api/collections/stations/records", {
    key: name.toLowerCase(),
    name,
    name_nl: `Station E2E ${info.project.name}`,
    country: "FR",
    aliases: [`Alias E2E ${info.project.name}`],
    search_key: `|gare e2e ${info.project.name}|station e2e ${info.project.name}|alias e2e ${info.project.name}|`,
    lines: ["96"],
    served: true,
  });
  created.push({ col: "stations", id: st.id });
  await login(page, "/referentiels/gares");
  await page.goto(`/referentiels/gares?q=${encodeURIComponent(`Alias E2E ${info.project.name}`)}`);
  await expect(page.getByText(name).filter({ visible: true }).first()).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({
    path: `test-results/trains-gares-${info.project.name}.png`,
    fullPage: true,
  });
  const select = page.getByTestId("station-district").filter({ visible: true }).first();
  await select.selectOption("DSE");
  await expect(page.getByText(`${name} : district enregistré.`)).toBeVisible();
  const rec = await pb("GET", `/api/collections/stations/records/${st.id}`);
  expect(rec).toMatchObject({ district: "DSE", district_manual: true });
});

test("lignes : liste, filtres district et gare, gares dans l'ordre", async ({ page }, info) => {
  const p = info.project.name;
  const gare = `Lignes E2E ${p}`;
  const abbr = `LE2E${p === "desktop" ? "D" : "M"}`;
  const st = await pb("POST", "/api/collections/stations/records", {
    key: `lignes e2e ${p}`,
    name: gare,
    abbr,
    country: "BE",
    district: "DSO",
    search_key: `|lignes e2e ${p}|`,
    lines: [LN],
    served: true,
  });
  created.push({ col: "stations", id: st.id });
  const railStations = [
    { n: gare, a: abbr, km: 0.4 },
    { n: "Milieu E2E" },
    { n: "Reprise E2E", g: 1, km: 12.5 },
    { n: "Terminus E2E", km: 20 },
    { n: "Antenne E2E", b: 1 },
  ];
  const railBranches = [{ b: 1, from: "Milieu E2E", to: "Antenne E2E" }];
  const line = await pb("POST", "/api/collections/rail_lines/records", {
    line: LN,
    name: `${gare} – Terminus E2E`,
    stations: railStations,
    branches: railBranches,
    // Version de l'import (1760004100) : « Rétablir l'automatique » la reprend.
    stations_auto: railStations,
    branches_auto: railBranches,
    name_auto: `${gare} – Terminus E2E`,
    count: 5,
    oriented: true,
  });
  created.push({ col: "rail_lines", id: line.id });

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "/referentiels/lignes");
  // Recherche par gare (nom ou abréviation PtCar) : la ligne fictive seule.
  await page.goto(`/referentiels/lignes?gare=${encodeURIComponent(gare)}`);
  const grid = page.getByTestId("lines-grid");
  await expect(grid.getByText(`L.${LN}`)).toBeVisible();
  await expect(grid.getByRole("link")).toHaveCount(1);
  await page.goto(`/referentiels/lignes?gare=${abbr}`);
  await expect(grid.getByText(`L.${LN}`)).toBeVisible();
  // District tiré de Ressources › Gares : il faut 30 % des gares de la ligne. Une gare DSO sur cinq ne suffit pas
  // (avant le 14 oct., la majorité parmi les seules gares avec un district rattachait des lignes flamandes au sud).
  await page.goto("/referentiels/lignes?district=DSO");
  await expect(page.getByTestId("lines-grid").getByText(`L.${LN}`)).toHaveCount(0);
  await page.goto("/referentiels/lignes?district=aucun");
  await expect(grid.getByText(`L.${LN}`)).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/lignes-liste-${p}.png`, fullPage: true });

  // Fiche : « L.998 » accepté, tronc dans l'ordre avec la reprise signalée, embranchement, liens vers Trains.
  await page.goto(`/referentiels/lignes?ligne=L.${LN}`);
  const detail = page.getByTestId("line-detail");
  await expect(detail.getByText(`${gare} – Terminus E2E`)).toBeVisible();
  const trunk = detail.getByTestId("line-stations");
  await expect(trunk.getByRole("listitem")).toHaveCount(4);
  await expect(trunk.getByRole("listitem").nth(2)).toContainText("Reprise E2E");
  await expect(trunk.getByText("Section parcourue sous un autre n° de ligne")).toBeVisible();
  await expect(trunk.getByText("km 12,5")).toBeVisible();
  await expect(detail.getByTestId("line-branch-1")).toContainText("Antenne E2E");
  await expect(detail.getByText("Embranchement depuis Milieu E2E")).toBeVisible();
  await expect(trunk.getByRole("link", { name: gare })).toHaveAttribute(
    "href",
    `/referentiels/trains?vue=gare&gare=${encodeURIComponent(gare).replace(/%20/g, "+")}`,
  );
  await expect(detail.getByRole("link", { name: /Relations sur la ligne/ })).toHaveAttribute(
    "href",
    `/referentiels/trains?vue=ligne&ligne=${LN}`,
  );
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/lignes-fiche-${p}.png`, fullPage: true });

  // Correction manuelle (remplace Admin › Lignes et arrêts) : Terminus monte d'un cran, badge, puis retour à l'import.
  await detail.getByTestId("line-edit").click();
  const editor = page.getByTestId("line-editor");
  await editor.getByRole("button", { name: "Monter Terminus E2E" }).click();
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/lignes-edition-${p}.png`, fullPage: true });
  await editor.getByTestId("line-save").click();
  await expect(detail.getByTestId("line-manual")).toBeVisible();
  await expect(trunk.getByRole("listitem").nth(2)).toContainText("Terminus E2E");
  await detail.getByTestId("line-edit").click();
  page.once("dialog", (d) => void d.accept());
  await editor.getByRole("button", { name: /Rétablir l'automatique/ }).click();
  await expect(detail.getByTestId("line-manual")).toHaveCount(0);
  await expect(trunk.getByRole("listitem").nth(2)).toContainText("Reprise E2E");
  expect(errors).toEqual([]);
});
