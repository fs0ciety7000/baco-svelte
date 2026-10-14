import { expect, test } from "@playwright/test";

import { identity, login, noHorizontalScroll } from "./helpers";

// Équipe › Planning et Administration › Quinyx (horaires Quinyx, 14 oct. 2026). Données FICTIVES écrites par le
// superuser (groupe, agents « E2E Quinyx », prestations du jour), supprimées à la fin ; l'extension n'est pas jouée ici
// (l'ingestion est couverte par les tests unitaires de `lib/quinyx/model.ts` et un essai local).

const PB = process.env.PB_URL ?? "http://127.0.0.1:8090";
const SU = {
  identity: process.env.PB_SUPERUSER_EMAIL ?? "",
  password: process.env.PB_SUPERUSER_PASSWORD ?? "",
};
const ADMIN = {
  identity: process.env.E2E_ADMIN_IDENTITY ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? "",
};
test.skip(!SU.identity || !identity, "superuser / agent E2E non définis");
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

const brusselsDay = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
const pbTime = (ms: number) => new Date(ms).toISOString().replace("T", " ");

let GROUP = "990001";
let LABEL = "E2E Quinyx desktop";

test.beforeAll(async ({}, info) => {
  if (info.project.name !== "desktop") [GROUP, LABEL] = ["990002", "E2E Quinyx mobile"];
  const base = GROUP.slice(-1);
  token = (await pb("POST", "/api/collections/_superusers/auth-with-password", SU)).token;
  for (const [col, filter] of [
    ["quinyx_shifts", `group_id="${GROUP}"`],
    ["quinyx_agents", `quinyx_id~"99${base}0"`],
    ["quinyx_groups", `group_id="${GROUP}"`],
  ]) {
    const old = await pb(
      "GET",
      `/api/collections/${col}/records?perPage=100&filter=${encodeURIComponent(filter!)}`,
    );
    for (const r of old?.items ?? []) await pb("DELETE", `/api/collections/${col}/records/${r.id}`);
  }
  const users = await pb(
    "GET",
    `/api/collections/users/records?perPage=1&filter=${encodeURIComponent(`email="${identity}" || username="${identity}"`)}`,
  );
  const me = users.items[0]?.id as string;
  const g = await pb("POST", "/api/collections/quinyx_groups/records", {
    group_id: GROUP,
    label: LABEL,
    district: "DSO",
    enabled: true,
    last_sync: pbTime(Date.now() - 20 * 60_000),
    last_from: brusselsDay(),
    last_to: brusselsDay(new Date(Date.now() + 10 * 86_400_000)),
    last_count: 3,
  });
  created.push({ col: "quinyx_groups", id: g.id });
  const agent = async (n: number, first: string, user = "") => {
    const a = await pb("POST", "/api/collections/quinyx_agents/records", {
      quinyx_id: `99${base}0${n}`,
      first_name: first,
      last_name: LABEL,
      user,
      confirmed: !!user,
      groups: [GROUP],
    });
    created.push({ col: "quinyx_agents", id: a.id });
    return a.id as string;
  };
  const mine = await agent(1, "Moi", me);
  const other = await agent(2, "Collègue");
  await agent(3, "Sans compte");
  const day = brusselsDay();
  const now = Date.now();
  const shift = async (
    n: number,
    a: string,
    start: number,
    end: number,
    code: string,
    kind: string,
    district: string,
  ) => {
    const s = await pb("POST", "/api/collections/quinyx_shifts/records", {
      quinyx_id: `${GROUP}${n}`,
      group_id: GROUP,
      agent: a,
      day,
      start: pbTime(start),
      end: pbTime(end),
      code,
      section: "PACO Mons",
      kind,
      district,
    });
    created.push({ col: "quinyx_shifts", id: s.id });
  };
  // Prestation en cours pour l'agent E2E (widget « Fin de service », « En service ») et une autre pour un collègue.
  await shift(1, mine, now - 60 * 60_000, now + 3 * 3600_000, "PACO_AM", "am", "DSO");
  await shift(2, other, now + 4 * 3600_000, now + 12 * 3600_000, "RCCA_PM", "pm", "DSE");
});

test.afterAll(async () => {
  for (const c of created.reverse())
    await pb("DELETE", `/api/collections/${c.col}/records/${c.id}`).catch(() => null);
});

test("planning : jour, semaine, fraîcheur, mobile", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "/ressources/planning");
  await expect(page.getByTestId("quinyx-freshness")).toContainText(LABEL);
  await expect(page.getByTestId("quinyx-freshness")).toContainText(
    "synchronisé avec Quinyx il y a 20 min",
  );
  // Agent rattaché : affiché sous le nom de son compte CSM, marqué « (toi) ». (Les deux formats rattachent le même compte.)
  const mine = page.getByTestId("planning-shift").filter({ hasText: "(toi)" }).first();
  await expect(mine).toContainText("PACO_AM · PACO Mons");
  await expect(mine).toContainText("En service");
  await expect(
    page.getByTestId("planning-shift").filter({ hasText: `Collègue ${LABEL}` }),
  ).toContainText("DSE");
  await noHorizontalScroll(page);
  await page.screenshot({
    path: `test-results/quinyx-planning-jour-${info.project.name}.png`,
    fullPage: true,
  });

  await page.getByTestId("planning-week").click();
  await expect(page).toHaveURL(/vue=semaine/);
  await expect(page.getByTestId("planning-title")).toContainText("Semaine du");
  const view =
    info.project.name === "desktop"
      ? page.getByTestId("planning-grid")
      : page.getByTestId("planning-week-list");
  await expect(view).toContainText(`Collègue ${LABEL}`);
  await noHorizontalScroll(page);
  await page.screenshot({
    path: `test-results/quinyx-planning-semaine-${info.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("accueil : fin de service selon Quinyx", async ({ page }) => {
  await login(page);
  const widget = page.getByTestId("shift-widget");
  test.skip((await widget.count()) === 0, "widget « Fin de service » masqué pour ce compte");
  await expect(page.getByTestId("shift-quinyx").first()).toContainText("PACO_AM · PACO Mons");
});

test("administration : groupes, lieux, agents", async ({ page }, info) => {
  test.skip(!ADMIN.identity, "compte admin E2E non défini");
  await page.goto("/connexion?suite=%2Fadmin%2Fquinyx");
  await page.getByLabel("E-mail ou identifiant").fill(ADMIN.identity);
  await page.getByLabel("Mot de passe").fill(ADMIN.password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/quinyx$/);
  await expect(page.getByTestId("quinyx-groups")).toContainText(LABEL);
  await expect(page.getByTestId("quinyx-places")).toContainText("OCC SO");
  await page.getByRole("button", { name: /^Tous/ }).click();
  await expect(page.getByTestId("quinyx-agents")).toContainText(`Sans compte ${LABEL}`);
  await noHorizontalScroll(page);
  await page.screenshot({
    path: `test-results/quinyx-admin-${info.project.name}.png`,
    fullPage: true,
  });
});
