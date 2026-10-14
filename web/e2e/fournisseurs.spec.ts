import { expect, test } from "@playwright/test";

import { identity, login, noHorizontalScroll, password } from "./helpers";

// Commandes › Fournisseurs (15 oct. 2026) : lignes desservies d'une société de bus choisies en masse dans le référentiel
// `rail_lines` (choix multiple), plus de saisie libre ; une ancienne valeur hors référentiel reste lisible.
// Données fictives (lignes 9xx, société « E2E »), supprimées à la fin.

const PB = (process.env.PB_URL ?? "http://127.0.0.1:8090").replace(/\/$/, "");
const suEmail = process.env.PB_SUPERUSER_EMAIL ?? "";
const suPassword = process.env.PB_SUPERUSER_PASSWORD ?? "";
test.skip(!identity || !password || !suEmail, "E2E_IDENTITY / PB_SUPERUSER_* non définis");

let root = "";
async function pb(method: string, path: string, body?: unknown) {
  const res = await fetch(`${PB}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(root ? { authorization: root } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.status === 204 ? null : res.json();
}

test("fournisseurs : lignes desservies choisies dans le référentiel", async ({ page }, info) => {
  root = (
    await pb("POST", "/api/collections/_superusers/auth-with-password", {
      identity: suEmail,
      password: suPassword,
    })
  ).token;
  const n = info.project.name === "desktop" ? 1 : 2;
  const L1 = `98${n}`;
  const L2 = `97${n}`;
  const NAME = `Autocars E2E ${n}${Math.random().toString(36).slice(2, 5)}`;
  const created: [string, string][] = [];
  for (const line of [L1, L2]) {
    const old = await pb(
      "GET",
      `/api/collections/rail_lines/records?filter=${encodeURIComponent(`line="${line}"`)}`,
    );
    for (const r of old?.items ?? []) await pb("DELETE", `/api/collections/rail_lines/records/${r.id}`);
    const r = await pb("POST", "/api/collections/rail_lines/records", {
      line,
      name: `Gare Alpha ${line} – Gare Bravo ${line}`,
      stations: [{ n: `Gare Alpha ${line}` }, { n: `Gare Bravo ${line}` }],
      branches: [],
      count: 2,
    });
    if (r?.id) created.push(["rail_lines", r.id]);
  }
  const company = await pb("POST", "/api/collections/bus_companies/records", { name: NAME });
  created.push(["bus_companies", company.id]);
  // Ancienne valeur saisie à la main (BACO) : gardée et signalée « hors référentiel ».
  const legacy = await pb("POST", "/api/collections/bus_company_lines/records", {
    company: company.id,
    line: "Navette E2E",
  });
  created.push(["bus_company_lines", legacy.id]);
  try {
    await login(page, "/commandes/fournisseurs");
    await page.goto(`/commandes/fournisseurs?type=bus&q=${encodeURIComponent(NAME)}`);
    await page.getByRole("button", { name: NAME }).first().click();
    const box = page.getByTestId("company-lines");
    await expect(box).toContainText("Navette E2E");
    await expect(box).toContainText("hors référentiel");
    // Choix multiple : deux lignes du référentiel cochées d'un coup.
    await box.getByTestId("company-lines-select").click();
    const list = page.getByRole("listbox").filter({ visible: true }).last();
    const search = page.getByRole("searchbox").filter({ visible: true }).last();
    await search.fill(`Alpha ${L1}`);
    await list.getByRole("option", { name: new RegExp(`L\\.${L1}`) }).click();
    await search.fill(`Alpha ${L2}`);
    await list.getByRole("option", { name: new RegExp(`L\\.${L2}`) }).click();
    await page.keyboard.press("Escape");
    await expect(box.getByTestId("company-lines-save")).toContainText("+2");
    await box.getByTestId("company-lines-save").click();
    await expect(box).toContainText(`L.${L1}`);
    await expect(box).toContainText(`Gare Alpha ${L2}`);
    await expect(box.getByTestId("company-lines-save")).toHaveCount(0);
    const stored = await pb(
      "GET",
      `/api/collections/bus_company_lines/records?filter=${encodeURIComponent(`company="${company.id}"`)}`,
    );
    expect(stored.items.map((l: { line: string }) => l.line).sort()).toEqual(
      [`L.${L1}`, `L.${L2}`, "Navette E2E"].sort(),
    );
    await noHorizontalScroll(page);
    await page.screenshot({ path: `test-results/fournisseurs-lignes-${info.project.name}.png` });
  } finally {
    const lines = await pb(
      "GET",
      `/api/collections/bus_company_lines/records?filter=${encodeURIComponent(`company="${company.id}"`)}`,
    );
    for (const l of lines?.items ?? [])
      await pb("DELETE", `/api/collections/bus_company_lines/records/${l.id}`);
    for (const [col, id] of created.reverse())
      if (col !== "bus_company_lines") await pb("DELETE", `/api/collections/${col}/records/${id}`);
  }
});
