import { expect, test } from "@playwright/test";

import { identity, login, loginAdmin, noHorizontalScroll } from "./helpers";

// Ressources › Planning › Non pourvus (services Quinyx PACO / RCCA sans agent, 23 oct. 2026). Données FICTIVES écrites par
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
let LABEL = "E2E Non pourvus desktop";

test.beforeAll(async ({}, info) => {
  if (info.project.name !== "desktop") [GROUP, LABEL] = ["990302", "E2E Non pourvus mobile"];
  token = (await pb("POST", "/api/collections/_superusers/auth-with-password", SU)).token;
  for (const col of ["quinyx_open_shifts", "quinyx_groups"]) {
    const old = await pb(
      "GET",
      `/api/collections/${col}/records?perPage=100&filter=${encodeURIComponent(`group_id="${GROUP}"`)}`,
    );
    for (const r of old?.items ?? []) await pb("DELETE", `/api/collections/${col}/records/${r.id}`);
  }
  const g = await pb("POST", "/api/collections/quinyx_groups/records", {
    group_id: GROUP,
    label: LABEL,
    district: "DSO",
    enabled: true,
  });
  created.push({ col: "quinyx_groups", id: g.id });
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
      district: "DSO",
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
  await page.goto(`/ressources/planning/non-pourvus?zone=${GROUP}`);
  const scope = page.getByTestId(desktop ? "open-table" : "open-cards");
  await expect(scope.getByText("PACO_N")).toBeVisible();
  // Compteurs par prestation réelle : pas de « RCCA Nuit » (la nuit est PACO seulement).
  const stats = page.getByLabel(/^Services non pourvus, /);
  await expect(stats.getByText("PACO Nuit", { exact: true })).toBeVisible();
  await expect(stats.getByText("RCCA Nuit", { exact: true })).toHaveCount(0);
  await expect(scope.locator(desktop ? "[data-testid=open-row]" : ":scope > li")).toHaveCount(3);
  // Filtre par fonction (URL) : seulement RCCA (un service, PM).
  await page.goto(`/ressources/planning/non-pourvus?zone=${GROUP}&fonction=rcca`);
  await expect(
    page
      .getByTestId(desktop ? "open-table" : "open-cards")
      .locator(desktop ? "[data-testid=open-row]" : ":scope > li"),
  ).toHaveCount(1);
  await noHorizontalScroll(page);
  if (process.env.E2E_SHOTS_DIR)
    await page.screenshot({
      path: `${process.env.E2E_SHOTS_DIR}/non-pourvus-${info.project.name}.png`,
      fullPage: true,
    });
  // Exports (même session).
  const q = `zone=${GROUP}&annee=${month.slice(0, 4)}&mois=${Number(month.slice(5))}`;
  const json = await page.request.get(`/api/equipe/quinyx/non-pourvus?${q}`);
  expect(json.status()).toBe(200);
  const body = await json.json();
  expect(body.totals.total).toBe(3);
  expect(body.shifts[0]).toMatchObject({
    zone: LABEL,
    function: "paco",
    kind: "am",
    from: expect.stringMatching(/^\d\d:\d\d$/),
  });
  const csv = await page.request.get(`/api/equipe/quinyx/non-pourvus?${q}&format=csv`);
  expect(await csv.text()).toContain("RCCA_PM");
  const xlsx = await page.request.get(`/api/equipe/quinyx/non-pourvus?${q}&format=xlsx`);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
  expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK");
  const pdf = await page.request.get(`/api/equipe/quinyx/non-pourvus?${q}&format=pdf`);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
});

test("PACO/RCCA : vue et route refusées par défaut", async ({ page }) => {
  await login(page, "/ressources/planning");
  const r = await page.request.get("/api/equipe/quinyx/non-pourvus");
  expect(r.status()).toBe(404);
  await expect(page.getByRole("link", { name: "Non pourvus", exact: true })).toHaveCount(0);
  const p = await page.goto("/ressources/planning/non-pourvus");
  expect(p?.status()).toBe(404);
});
