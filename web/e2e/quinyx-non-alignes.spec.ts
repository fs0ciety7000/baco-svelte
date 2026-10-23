import { expect, test } from "@playwright/test";

import { identity, login, loginAdmin, noHorizontalScroll } from "./helpers";

// Ressources › Planning › Non alignés (postes Quinyx PACO / RCCA sans agent propre : vides ou couverts par fusion « +SE »,
// 23 oct. 2026). Données FICTIVES écrites par
// le superuser (groupe « E2E Non pourvus », services du mois en cours), supprimées à la fin. Vue réservée aux admins par
// défaut (`quinyx_open:read`) : l'agent E2E (PACO/RCCA) ne la voit pas.

const PB = process.env.PB_URL ?? "http://127.0.0.1:8090";
const SU = {
  identity: process.env.PB_SUPERUSER_EMAIL ?? "",
  password: process.env.PB_SUPERUSER_PASSWORD ?? "",
};
const ADMIN = {
  identity: process.env.E2E_ADMIN_IDENTITY ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? "",
};
test.skip(
  !SU.identity || !ADMIN.identity || !identity,
  "superuser / admin / agent E2E non définis",
);
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

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
const month = today.slice(0, 7);
let GROUP = "990301";
let LABEL = "E2E Non alignés desktop";
// Groupe de l'autre OCC (agent qui fait les deux postes) ; districts différents par format (tests en parallèle).
let OTHER = "990311";
let DISTRICT = "DSO";

test.beforeAll(async ({}, info) => {
  if (info.project.name !== "desktop")
    [GROUP, LABEL, OTHER, DISTRICT] = ["990302", "E2E Non alignés mobile", "990312", "DCE"];
  token = (await pb("POST", "/api/collections/_superusers/auth-with-password", SU)).token;
  for (const col of ["quinyx_open_shifts", "quinyx_covers", "quinyx_groups"]) {
    const old = await pb(
      "GET",
      `/api/collections/${col}/records?perPage=100&filter=${encodeURIComponent(`group_id="${GROUP}" || group_id="${OTHER}"`)}`,
    );
    for (const r of old?.items ?? []) await pb("DELETE", `/api/collections/${col}/records/${r.id}`);
  }
  const g = await pb("POST", "/api/collections/quinyx_groups/records", {
    group_id: GROUP,
    label: LABEL,
    district: DISTRICT,
    enabled: true,
  });
  created.push({ col: "quinyx_groups", id: g.id });
  const o = await pb("POST", "/api/collections/quinyx_groups/records", {
    group_id: OTHER,
    label: `${LABEL} (autre OCC)`,
    district: "DSE",
    enabled: true,
  });
  created.push({ col: "quinyx_groups", id: o.id });
  // Le PACO AM du 2 : agent de l'autre OCC noté « +SO » / « +CE » (il fait les deux postes).
  const cov = await pb("POST", "/api/collections/quinyx_covers/records", {
    quinyx_id: `${OTHER}9`,
    group_id: OTHER,
    day: `${month}-02`,
    start: `${month}-02 04:00:00.000Z`,
    end: `${month}-02 12:00:00.000Z`,
    code: "PACO_AM",
    section: "PACO autre",
    kind: "am",
    function: "paco",
    district: "DSE",
    cover: DISTRICT,
  });
  created.push({ col: "quinyx_covers", id: cov.id });
  const rows: [string, string, string, string, string, string][] = [
    // jour, début UTC, fin UTC, code, type, fonction
    [
      `${month}-02`,
      `${month}-02 04:00:00.000Z`,
      `${month}-02 12:00:00.000Z`,
      "PACO_AM",
      "am",
      "paco",
    ],
    [
      `${month}-03`,
      `${month}-03 12:00:00.000Z`,
      `${month}-03 20:00:00.000Z`,
      "RCCA_PM",
      "pm",
      "rcca",
    ],
    [
      `${month}-04`,
      `${month}-04 20:00:00.000Z`,
      `${month}-05 04:00:00.000Z`,
      "PACO_N",
      "nuit",
      "paco",
    ],
  ];
  for (const [i, [day, start, end, code, kind, fn]] of rows.entries()) {
    const r = await pb("POST", "/api/collections/quinyx_open_shifts/records", {
      quinyx_id: `${GROUP}${i}`,
      group_id: GROUP,
      day,
      start,
      end,
      code,
      section: fn === "rcca" ? "RCCA E2E" : "PACO E2E",
      kind,
      function: fn,
      district: DISTRICT,
    });
    created.push({ col: "quinyx_open_shifts", id: r.id });
  }
});

test.afterAll(async () => {
  for (const { col, id } of created.reverse())
    await pb("DELETE", `/api/collections/${col}/records/${id}`).catch(() => null);
});

test("admin : liste du mois, filtre, exports", async ({ page }, info) => {
  const desktop = info.project.name === "desktop";
  await loginAdmin(page, "/ressources/planning");
  await page.goto(`/ressources/planning/non-alignes?zone=${GROUP}`);
  const scope = page.getByTestId(desktop ? "open-table" : "open-cards");
  // Desktop : type Quinyx dans le tableau ; mobile : horaire de la nuit dans la carte.
  await expect(scope.getByText(desktop ? "PACO_N" : /22:00 – 06:00/)).toBeVisible();
  // Compteurs par prestation réelle : pas de « RCCA Nuit » (la nuit est PACO seulement).
  const stats = page.getByLabel(/^Services non alignés, /);
  await expect(stats.getByText("Couverts par fusion", { exact: true })).toBeVisible();
  await expect(scope.getByText(/Fusion \+(SO|CE)|fusion \+(SO|CE)/)).toBeVisible();
  await expect(stats.getByText("PACO Nuit", { exact: true })).toBeVisible();
  await expect(stats.getByText("RCCA Nuit", { exact: true })).toHaveCount(0);
  await expect(scope.locator(desktop ? "[data-testid=open-row]" : ":scope > li")).toHaveCount(3);
  // Filtre par fonction (URL) : seulement RCCA (un service, PM).
  await page.goto(`/ressources/planning/non-alignes?zone=${GROUP}&fonction=rcca`);
  await expect(
    page
      .getByTestId(desktop ? "open-table" : "open-cards")
      .locator(desktop ? "[data-testid=open-row]" : ":scope > li"),
  ).toHaveCount(1);
  // Filtre par couverture : seulement les postes restés sans agent.
  const empty = await page.request.get(
    `/api/equipe/quinyx/non-alignes?zone=${GROUP}&annee=${month.slice(0, 4)}&mois=${Number(month.slice(5))}&couverture=vide`,
  );
  expect((await empty.json()).totals).toMatchObject({ total: 2, fusion: 0 });
  await noHorizontalScroll(page);
  if (process.env.E2E_SHOTS_DIR)
    await page.screenshot({
      path: `${process.env.E2E_SHOTS_DIR}/non-alignes-${info.project.name}.png`,
      fullPage: true,
    });
  // Exports (même session).
  const q = `zone=${GROUP}&annee=${month.slice(0, 4)}&mois=${Number(month.slice(5))}`;
  const json = await page.request.get(`/api/equipe/quinyx/non-alignes?${q}`);
  expect(json.status()).toBe(200);
  const body = await json.json();
  expect(body.totals).toMatchObject({ total: 3, fusion: 1, empty: 2 });
  expect(body.shifts[0]).toMatchObject({
    zone: LABEL,
    function: "paco",
    kind: "am",
    status: "fusion",
    coveredBy: `${LABEL} (autre OCC)`,
    from: expect.stringMatching(/^\d\d:\d\d$/),
  });
  const csv = await page.request.get(`/api/equipe/quinyx/non-alignes?${q}&format=csv`);
  expect(await csv.text()).toContain("RCCA_PM");
  const xlsx = await page.request.get(`/api/equipe/quinyx/non-alignes?${q}&format=xlsx`);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
  expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK");
  const pdf = await page.request.get(`/api/equipe/quinyx/non-alignes?${q}&format=pdf`);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
});

test("PACO/RCCA : vue et route refusées par défaut", async ({ page }) => {
  await login(page, "/ressources/planning");
  const r = await page.request.get("/api/equipe/quinyx/non-alignes");
  expect(r.status()).toBe(404);
  await expect(page.getByRole("link", { name: "Non alignés", exact: true })).toHaveCount(0);
  const p = await page.goto("/ressources/planning/non-alignes");
  expect(p?.status()).toBe(404);
});
