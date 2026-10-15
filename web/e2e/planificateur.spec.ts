import { expect, test, type Page } from "@playwright/test";

import { identity, login, noHorizontalScroll } from "./helpers";

// PMR › Planificateur, vue Jour (lot P1, 15 oct. 2026). Données FICTIVES écrites par le superuser : un groupe Quinyx
// « gares » 99010x, agents « Agent Test A. / B. / C. », prestations du jour, tâches DICOS fictives (trains 991xx en
// desktop, 992xx en mobile : les deux formats tournent en parallèle sur la même base) ; tout est supprimé à la fin.
// Le compte E2E doit avoir `planner:write` (PACO/RCCA et au-dessus).

const PB = process.env.PB_URL ?? "http://127.0.0.1:8090";
const SU = {
  identity: process.env.PB_SUPERUSER_EMAIL ?? "",
  password: process.env.PB_SUPERUSER_PASSWORD ?? "",
};
const SHOTS = process.env.E2E_SHOTS_DIR ?? "";
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

/** Instant UTC (format PocketBase) d'une heure de Bruxelles le jour `day`. */
function at(day: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  // Décalage de Bruxelles ce jour-là (été / hiver), mesuré à midi.
  const noon = new Date(`${day}T12:00:00Z`);
  const local = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Brussels",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(noon),
  );
  const offset = local - 12;
  return new Date(
    Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), h! - offset, m),
  )
    .toISOString()
    .replace("T", " ");
}

const DAY = brusselsDay();
let P = "1"; // 1 = desktop (district DSO, Mons), 2 = mobile (district DSE, Namur)
let GROUP = "990101";
let MAIN = "Mons";
let FAR = "Charleroi-Central";
let DISTRICT = "DSO";
const train = (n: number) => `99${P}${String(n).padStart(2, "0")}`;
const agentId: Record<string, string> = {};
const taskId: Record<string, string> = {};

test.beforeAll(async ({}, info) => {
  if (info.project.name !== "desktop")
    [P, GROUP, MAIN, FAR, DISTRICT] = ["2", "990102", "Namur", "Liège-Guillemins", "DSE"];
  token = (await pb("POST", "/api/collections/_superusers/auth-with-password", SU)).token;
  // Restes d'une exécution interrompue.
  for (const [col, filter] of [
    ["planner_tasks", `train ~ "99${P}" && day = "${DAY}"`],
    ["quinyx_shifts", `group_id = "${GROUP}"`],
    ["quinyx_agents", `quinyx_id ~ "99${P}0"`],
    ["quinyx_groups", `group_id = "${GROUP}"`],
  ] as const) {
    const old = await pb(
      "GET",
      `/api/collections/${col}/records?perPage=200&filter=${encodeURIComponent(filter)}`,
    );
    for (const r of old?.items ?? []) await pb("DELETE", `/api/collections/${col}/records/${r.id}`);
  }
  const g = await pb("POST", "/api/collections/quinyx_groups/records", {
    group_id: GROUP,
    label: `E2E gares ${P}`,
    district: DISTRICT,
    enabled: true,
    purpose: "gares",
  });
  created.push({ col: "quinyx_groups", id: g.id });
  const suffix = P === "1" ? "" : " (m)";
  const agents: [string, string, string, string, string, string][] = [
    // clé, prénom, poste, base, début, fin
    ["A", "Agent Test A.", "OPI", MAIN, "06:00", "22:00"],
    ["B", "Agent Test B.", "PA", MAIN, "06:00", "14:00"],
    ["C", "Agent Test C.", "CPI", FAR, "06:00", "22:00"],
  ];
  let n = 0;
  for (const [key, first, post, base, s, e] of agents) {
    n++;
    const a = await pb("POST", "/api/collections/quinyx_agents/records", {
      quinyx_id: `99${P}0${n}`,
      first_name: first,
      last_name: suffix.trim(),
      groups: [GROUP],
      purpose: "gares",
    });
    created.push({ col: "quinyx_agents", id: a.id });
    agentId[key] = a.id;
    const sh = await pb("POST", "/api/collections/quinyx_shifts/records", {
      quinyx_id: `${GROUP}${n}`,
      group_id: GROUP,
      agent: a.id,
      day: DAY,
      start: at(DAY, s),
      end: at(DAY, e),
      code: `${post}_AM`,
      section: `${post} ${base.toUpperCase()}`,
      kind: "am",
      post,
      base,
    });
    created.push({ col: "quinyx_shifts", id: sh.id });
  }
  const task = async (key: string, o: Record<string, unknown>) => {
    const t = await pb("POST", "/api/collections/planner_tasks/records", {
      day: DAY,
      kind: "pmr_in",
      station: MAIN,
      station_key: MAIN.toLowerCase(),
      pmr_type: "MR",
      pax: 1,
      light: true,
      source: "dicos_mission",
      dicos_status: "accepted",
      status: "a_attribuer",
      ...o,
      end: o.start,
    });
    created.push({ col: "planner_tasks", id: t.id });
    taskId[key] = t.id;
  };
  await task("t1", { start: at(DAY, "09:50"), train: train(1), other_station: "Tournai" });
  await task("t2", { start: at(DAY, "10:30"), train: train(2), other_station: "Tournai" });
  await task("t3", {
    start: at(DAY, "11:00"),
    train: train(3),
    other_station: "Tournai",
    assignee_kind: "agent",
    assignee_agent: agentId.B,
    status: "attribuee",
  });
  await task("t4", { start: at(DAY, "11:02"), train: train(4), other_station: "Tournai" });
  const dossier = `${DAY}-99${P}1`;
  await task("t5", {
    kind: "pmr_out",
    start: at(DAY, "12:40"),
    train: train(5),
    station: "Tournai",
    station_key: "tournai",
    other_station: "Mons",
    dossier,
    pmr_type: "CRF",
    light: false,
  });
  await task("t6", {
    start: at(DAY, "13:30"),
    train: train(6),
    station: "Tournai",
    station_key: "tournai",
    other_station: "Mouscron",
    dossier,
    pmr_type: "CRF",
    light: false,
  });
  await task("t7", {
    start: at(DAY, "12:00"),
    train: train(7),
    station: "Saint-Ghislain",
    station_key: "saint ghislain",
    other_station: "Mons",
    source: "dicos_pending",
    dicos_status: "proposal",
  });
});

test.afterAll(async () => {
  // Tâches saisies par le test (ALEA) comprises.
  const extra = await pb(
    "GET",
    `/api/collections/planner_tasks/records?perPage=200&filter=${encodeURIComponent(`train ~ "99${P}" && day = "${DAY}"`)}`,
  ).catch(() => null);
  for (const r of extra?.items ?? [])
    await pb("DELETE", `/api/collections/planner_tasks/records/${r.id}`).catch(() => null);
  for (const c of created.reverse())
    await pb("DELETE", `/api/collections/${c.col}/records/${c.id}`).catch(() => null);
});

async function setTheme(page: Page, theme: string) {
  const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  await page
    .context()
    .addCookies([
      { name: "csm_ui", value: JSON.stringify({ theme, density: "normal" }), url: base },
    ]);
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

const card = (page: Page, n: number) =>
  page
    .locator(`[data-testid="todo-card"][data-task="${taskId[`t${n}`]}"]`)
    .filter({ visible: true });
const row = (page: Page, key: string) => page.locator(`[data-drop-key="agent:${agentId[key]}"]`);

async function dragTo(
  page: Page,
  from: ReturnType<Page["locator"]>,
  to: ReturnType<Page["locator"]>,
) {
  const a = (await from.boundingBox())!;
  await to.scrollIntoViewIfNeeded();
  const header = to.locator("> div").first();
  const b = (await header.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2 + 10, { steps: 4 });
  await page.mouse.move(b.x + b.width - 20, b.y + b.height / 2, { steps: 12 });
}

test.describe("desktop", () => {
  test("vue Jour, glisser, refus hors zone, agent occupé, panneau, ALEA, auto", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop", "desktop seulement");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await setTheme(page, "jour");
    await login(page, "/pmr/planificateur");
    await page.goto(`/pmr/planificateur?district=${DISTRICT}`);
    await expect(page.getByTestId("planner-gantt")).toBeVisible();
    await expect(row(page, "A")).toBeVisible();
    await expect(page.getByTestId("planner-counters")).toContainText("à attribuer");
    await expect(card(page, 1)).toBeVisible();
    await expect(card(page, 7)).toContainText("En attente DICOS");
    await noHorizontalScroll(page);
    await shot(page, "jour-1440-clair");

    // Glisser T1 vers l'agent A (Mons) : accepté.
    await dragTo(page, card(page, 1), row(page, "A"));
    await expect(row(page, "A")).toHaveAttribute("data-drop", "ok");
    await expect(row(page, "C")).toHaveAttribute("data-drop", "block");
    await expect(page.getByTestId("drag-tip")).toContainText("Attribuer à Agent Test A.");
    await shot(page, "glisser-1440");
    await page.mouse.up();
    await expect(page.getByText(/attribué à Agent Test A\./)).toBeVisible();
    await expect(row(page, "A").locator(`[data-task-block*="${taskId.t1}"]`)).toBeVisible();
    await expect(card(page, 1)).toHaveCount(0);

    // Hors zone : Charleroi ne couvre pas Mons.
    await dragTo(page, card(page, 2), row(page, "C"));
    await expect(page.getByTestId("drag-tip")).toContainText("Hors zone");
    await page.mouse.up();
    await expect(page.getByText("Attribution refusée")).toBeVisible();
    await expect(card(page, 2)).toBeVisible();

    // Agent occupé (B a déjà le train 3 à la même heure) : proposition d'un agent libre.
    await dragTo(page, card(page, 4), row(page, "B"));
    await page.mouse.up();
    const picker = page.getByTestId("assign-picker");
    await expect(picker).toContainText("est occupé(e)");
    await expect(picker.getByTestId("picker-option").first()).toContainText("Agent Test A.");
    await picker.getByTestId("picker-option").first().click();
    await expect(row(page, "A").locator(`[data-task-block*="${taskId.t4}"]`)).toBeVisible();

    // Panneau d'une tâche du dossier : liste des autres tâches, ouverture de l'une d'elles.
    await card(page, 5)
      .getByRole("button", { name: /^Ouvrir/ })
      .click();
    const sheet = page.getByTestId("task-sheet");
    await expect(sheet).toContainText(`${DAY}-99${P}1`);
    await expect(sheet.getByTestId("sheet-dossier")).toContainText(train(6));
    await expect(page).toHaveURL(new RegExp(`tache=${taskId.t5}`));
    await page.waitForTimeout(700); // fin du glissement du panneau
    await shot(page, "panneau-1440");
    await sheet.getByTestId("sheet-dossier").getByRole("button").first().click();
    await expect(page).toHaveURL(new RegExp(`tache=${taskId.t6}`));
    await page.getByRole("button", { name: "Fermer le panneau" }).click();

    // Ajout d'une ligne ALEA fictive (sans nom).
    await page.getByTestId("planner-add").click();
    const add = page.getByTestId("add-task");
    await add
      .getByTestId("add-task-text")
      .fill(`1NV 15h20 ${train(8)} IN de Mons à Tournai n°${DAY}-99${P}8\n1CRF 16h00 IN de Mons`);
    await expect(add.getByTestId("add-task-line").first()).toContainText("Gare assistée Mons");
    await expect(add.getByTestId("add-task-line").nth(1)).toContainText("il manque le n° de train");
    await shot(page, "ajout-1440");
    await add.getByTestId("add-task-submit").click();
    await expect(page.getByText(/1 tâche ajoutée/)).toBeVisible();
    await expect(
      page.locator('[data-testid="todo-card"]').filter({ hasText: train(8) }),
    ).toBeVisible();

    // Attribution automatique : proposition puis « Tout accepter ».
    await page.getByTestId("planner-auto").click();
    const preview = page.getByTestId("planner-aside").getByTestId("auto-preview");
    await expect(preview).toBeVisible();
    await expect(page.getByTestId("planner-proposed").first()).toBeVisible();
    await shot(page, "auto-1440");
    await preview.getByTestId("auto-accept-all").click();
    await expect(page.getByText(/acceptée/)).toBeVisible();
    await expect(card(page, 2)).toHaveCount(0);
    await expect(
      page.locator(`[data-testid="planner-block"][data-task-block*="${taskId.t2}"]`),
    ).toHaveCount(1);

    // Thème Nuit.
    await setTheme(page, "nuit");
    await page.goto(`/pmr/planificateur?district=${DISTRICT}`);
    await expect(page.getByTestId("planner-gantt")).toBeVisible();
    await noHorizontalScroll(page);
    await shot(page, "jour-1440-nuit");
    expect(errors).toEqual([]);
  });
});

test.describe("mobile", () => {
  test("agenda et « Attribuer à… » en feuille du bas, sans défilement horizontal", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "mobile", "mobile seulement");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await setTheme(page, "jour");
    await login(page, "/pmr/planificateur");
    await page.goto(`/pmr/planificateur?district=${DISTRICT}`);
    const mobile = page.getByTestId("planner-mobile");
    await expect(mobile).toBeVisible();
    await expect(page.getByTestId("planner-gantt")).toBeHidden();
    await noHorizontalScroll(page);

    await mobile.getByRole("tab", { name: /À attribuer/ }).click();
    const c = card(page, 1);
    await expect(c).toBeVisible();
    await shot(page, "mobile-390-a-attribuer");
    const box = (await c.getByTestId("todo-assign").boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    await c.getByTestId("todo-assign").click();
    const picker = page.getByTestId("assign-picker");
    await expect(picker).toBeVisible();
    await picker.getByTestId("picker-option").filter({ hasText: "Agent Test A. (m)" }).click();
    await expect(page.getByText(/attribué à Agent Test A\. \(m\)/)).toBeVisible();
    await expect(card(page, 1)).toHaveCount(0);

    await mobile.getByRole("tab", { name: "Agenda" }).click();
    const agenda = page.getByTestId("mobile-agenda");
    await agenda.getByRole("combobox", { name: "Agent" }).click();
    await page
      .getByRole("listbox")
      .filter({ visible: true })
      .last()
      .getByRole("option", { name: /Agent Test A\. \(m\)/ })
      .click();
    await expect(agenda).toContainText(train(1));
    await noHorizontalScroll(page);
    await shot(page, "mobile-390-agenda");
    expect(errors).toEqual([]);
  });
});
