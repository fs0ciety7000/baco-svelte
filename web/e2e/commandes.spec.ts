import { expect, test, type Page } from "@playwright/test";

import { frDate, identity, login, noHorizontalScroll, password } from "./helpers";

// Module Commandes : création bus avec enregistrement automatique, envoi (.eml + PDF), confirmation depuis le
// suivi, taxi, B201, puis captures de chaque écran (desktop 1440 et mobile 390, thèmes Commandement et Ivoire).
// Données de test créées par le superuser (société de bus et de taxi fictives), supprimées à la fin.

const PB = (process.env.PB_URL ?? "http://127.0.0.1:8090").replace(/\/$/, "");
const suEmail = process.env.PB_SUPERUSER_EMAIL ?? "";
const suPassword = process.env.PB_SUPERUSER_PASSWORD ?? "";
test.skip(!identity || !password || !suEmail, "E2E_IDENTITY / PB_SUPERUSER_* non définis");
test.describe.configure({ mode: "serial" });

let root = "";
let templateId = "";
const fixtures: { col: string; id: string }[] = [];
const suffix = Math.random().toString(36).slice(2, 7);
const BUS_COMPANY = `Autocars Démo ${suffix}`;
const TAXI_COMPANY = `Taxis Démo ${suffix}`;

async function pb(method: string, path: string, body?: unknown) {
  const res = await fetch(`${PB}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(root ? { authorization: root } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.status === 204 ? null : res.json();
}

test.beforeAll(async ({}, info) => {
  const su = await pb("POST", "/api/collections/_superusers/auth-with-password", {
    identity: suEmail,
    password: suPassword,
  });
  root = su.token;
  const bus = await pb("POST", "/api/collections/bus_companies/records", {
    name: BUS_COMPANY,
    email: "planning@autocars-demo.invalid",
    phone: "065 00 00 00",
  });
  fixtures.push({ col: "bus_companies", id: bus.id });
  const taxi = await pb("POST", "/api/collections/taxi_companies/records", {
    name: TAXI_COMPANY,
    emails: ["dispatch@taxis-demo.invalid"],
    phones: ["065 11 11 11"],
    places: ["Mons"],
  });
  fixtures.push({ col: "taxi_companies", id: taxi.id });
  // Modèle complet (partagé) : « Préparer l'envoi » doit marcher sans rien modifier.
  const tpl = await pb("POST", "/api/collections/order_templates/records", {
    kind: "bus",
    name: `Modèle démo ${suffix}`,
    created_by: (
      await pb(
        "GET",
        `/api/collections/users/records?filter=${encodeURIComponent(`email="${identity}"`)}`,
      )
    ).items[0].id,
    data: {
      reason: "Travaux",
      origin: "Hal",
      destination: "Mons",
      company: bus.id,
      buses: [{ planned: "09:00" }],
    },
  });
  fixtures.push({ col: "order_templates", id: tpl.id });
  templateId = tpl.id;
  // Commande de démo propre au test (captures mobiles et panneau : la base de la CI est vide).
  const agent = await pb(
    "GET",
    `/api/collections/users/records?filter=${encodeURIComponent(`email="${identity}"`)}`,
  );
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(
    new Date(),
  );
  await pb("POST", "/api/collections/bus_orders/records", {
    status: "brouillon",
    created_by: agent.items[0].id,
    reason: "Commande de démonstration",
    order_date: `${today} 00:00:00.000Z`,
    origin: "Mons",
    destination: "Soignies",
    company: bus.id,
    buses: [{ planned: "08:00" }],
  });
  // Ligne du référentiel (rail_lines, 14 oct. 2026 : les bons ne lisent plus line_stations).
  const stations = ["Bruxelles-Midi", "Hal", "Braine-le-Comte", "Soignies", "Mons"];
  const rl = await pb("POST", "/api/collections/rail_lines/records", {
    line: `96${suffix}`.toUpperCase(),
    name: "Bruxelles-Midi – Mons",
    stations: stations.map((n) => ({ n })),
    stations_auto: stations.map((n) => ({ n })),
    branches: [],
    count: stations.length,
  });
  fixtures.push({ col: "rail_lines", id: rl.id });
  trains = await trainFixtures(info.project.name);
});

// Référentiel des trains (14 oct. 2026) : gares et train fictifs propres à chaque format (la base de la CI est vide, la
// base locale a un vrai import : noms et n° qui n'existent pas ailleurs).
async function trainFixtures(p: string) {
  const n = p === "desktop" ? 99831 : 99832;
  const name = (s: string) => `${s} E2E ${p}`;
  const fold = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  for (const [col, filter] of [
    ["train_services", `key="${n}:e2e-cmd"`],
    ["stations", `key~"e2e ${p}"`],
  ] as const) {
    const old = await pb(
      "GET",
      `/api/collections/${col}/records?perPage=50&filter=${encodeURIComponent(filter)}`,
    );
    for (const r of old?.items ?? []) await pb("DELETE", `/api/collections/${col}/records/${r.id}`);
  }
  const [alpha, bravo, charlie, delta] = ["Alpha", "Bravo", "Charlie", "Delta"].map(name) as [
    string,
    string,
    string,
    string,
  ];
  const deltaNl = name("Delta-Noord");
  const svc = await pb("POST", "/api/collections/train_services/records", {
    key: `${n}:e2e-cmd`,
    number: n,
    type: "IC",
    relation: "IC99",
    relation_source: "infrabel",
    series: "99800-99849",
    origin: alpha,
    terminus: delta,
    days: 127,
    stops: [
      { n: alpha, d: "08:00", l: "96" },
      { n: bravo, a: "08:10", d: "08:11", l: "96" },
      { n: charlie, p: 1, l: "97" },
      { n: delta, t: deltaNl, a: "08:30" },
    ],
    lines: ["96", "97"],
    lines_source: "infrabel",
    first_dep: "08:00",
    last_arr: "08:30",
    stations_key: `|${[alpha, bravo, delta, deltaNl].map(fold).join("|")}|`,
    pass_key: `|${fold(charlie)}|`,
    lines_key: "|96|97|",
  });
  fixtures.push({ col: "train_services", id: svc.id });
  for (const [st, nl] of [
    [alpha, ""],
    [delta, deltaNl],
  ] as const) {
    const r = await pb("POST", "/api/collections/stations/records", {
      key: fold(st),
      name: st,
      name_nl: nl,
      country: "BE",
      aliases: nl ? [nl] : [],
      search_key: `|${[st, nl].filter(Boolean).map(fold).join("|")}|`,
      lines: ["96"],
      served: true,
    });
    fixtures.push({ col: "stations", id: r.id });
  }
  return { n, alpha, bravo, charlie, delta, deltaNl };
}

let trains: Awaited<ReturnType<typeof trainFixtures>> | null = null;

test.afterAll(async () => {
  // Commandes créées par le test (rattachées aux sociétés de démo), puis les fiches de démo.
  for (const f of fixtures.filter((x) => x.col === "bus_companies")) {
    const list = await pb(
      "GET",
      `/api/collections/bus_orders/records?perPage=200&filter=${encodeURIComponent(`company="${f.id}"`)}`,
    );
    for (const o of list?.items ?? [])
      await pb("DELETE", `/api/collections/bus_orders/records/${o.id}`);
  }
  for (const f of fixtures.filter((x) => x.col === "taxi_companies")) {
    const list = await pb(
      "GET",
      `/api/collections/taxi_orders/records?perPage=200&filter=${encodeURIComponent(`taxi_company="${f.id}"`)}`,
    );
    for (const o of list?.items ?? [])
      await pb("DELETE", `/api/collections/taxi_orders/records/${o.id}`);
  }
  for (const f of fixtures.reverse())
    await pb("DELETE", `/api/collections/${f.col}/records/${f.id}`);
});

async function theme(page: Page, name: string) {
  await page.context().addCookies([
    {
      name: "csm_ui",
      value: JSON.stringify({ theme: name, density: "confortable" }),
      url: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    },
  ]);
}

async function snap(page: Page, name: string, project: string) {
  await page.waitForTimeout(500);
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/commandes-${name}-${project}.png`, fullPage: true });
}

let busUrl = "";

test("bus : création, enregistrement automatique, fin, envoi", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "parcours complet en desktop ; mobile en captures");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "/commandes/nouveau");

  await expect(page.getByTestId("autosave")).toHaveAttribute("data-state", "idle");
  // Valeurs par défaut : date du jour à Bruxelles, type « Remplacement ».
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(
    new Date(),
  );
  await expect(page.getByLabel("Date de circulation")).toHaveValue(frDate(today));
  await expect(page.getByRole("radio", { name: "Remplacement" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  await page.getByLabel("Motif").fill("Dérangement de signalisation (essai)");
  await expect(page.getByTestId("autosave")).toHaveAttribute("data-state", "saved", {
    timeout: 10_000,
  });
  const number = /n° (\d+)/.exec((await page.getByTestId("order-number").textContent()) ?? "")?.[1];
  // Même route après création (pas de remontage du formulaire), l'identifiant passe dans ?id=.
  await expect(page).toHaveURL(/\/commandes\/nouveau\?id=[a-z0-9]{15}&k=[a-z0-9]{8}$/);
  const id = new URL(page.url()).searchParams.get("id");
  busUrl = `/commandes/bus/${id}`;

  // Un 2e « Nouveau » repart d'un formulaire vierge (ne reprend pas ce brouillon).
  await page.goto("/commandes");
  await page.getByRole("link", { name: "Nouveau bon" }).click();
  await expect(page.getByTestId("order-number")).toHaveText("Nouveau bon");
  await expect(page.getByLabel("Motif")).toHaveValue("");
  await page.goto(busUrl);
  await expect(page.getByLabel("Motif")).toHaveValue("Dérangement de signalisation (essai)");

  await page.getByLabel("Origine").fill("Hal");
  await page.getByLabel("Destination").fill("Mons");
  await expect(page.getByRole("button", { name: "Soignies" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByLabel("Société").selectOption({ label: BUS_COMPANY });
  await page.getByLabel("Heure prévue").fill("14:30");
  await page.getByRole("button", { name: "Ajouter un bus" }).click();
  await expect(page.getByTestId("bus-row")).toHaveCount(2);

  // Cycle v3 (14 oct. 2026) : brouillon / en cours → Terminé (démobilisation) → Envoyé / finalisé.
  await page.getByTestId("transition-termine").click();
  const finish = page.getByRole("dialog");
  await expect(finish.getByText("Terminer la commande")).toBeVisible();
  await finish.getByLabel("Démobilisation").first().fill("17:45");
  await finish.getByRole("button", { name: "Terminer (bus démobilisés)" }).click();
  await expect(page.getByTestId("prepare-send")).toBeVisible();
  await page.getByTestId("prepare-send").click();
  await expect(page.getByTestId("send-to")).toHaveText("planning@autocars-demo.invalid");

  // Le brouillon Outlook : X-Unsent, destinataire, PDF joint.
  const eml = await page.request.get(`/api/commandes/bus/${id}/eml`);
  expect(eml.status()).toBe(200);
  const body = await eml.text();
  expect(body).toContain("X-Unsent: 1");
  expect(body).toContain("planning@autocars-demo.invalid");
  expect(body).toContain("application/pdf");
  const pdf = await page.request.get(`/api/commandes/bus/${id}/pdf`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");

  const download = page.waitForEvent("download");
  await page.getByTestId("validate-send").click();
  await download;
  // Valider l'envoi = brouillon Outlook + bon « Envoyé / finalisé » (14 oct. 2026).
  await expect(page.getByText("Envoyé / finalisé", { exact: true }).first()).toBeVisible();
  void number;
  expect(errors).toEqual([]);
});

test("modèle partagé : envoi possible sans modification", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "parcours en desktop");
  await login(page, "/commandes/nouveau");
  await page.goto(`/commandes/nouveau?modele=${templateId}`);
  await expect(page.getByLabel("Motif")).toHaveValue("Travaux");
  // Modèle non modifié : « Créer le bon » l'enregistre, puis Terminer et Valider l'envoi.
  await page.getByTestId("create-order").click();
  await page.getByTestId("transition-termine").click();
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible().catch(() => false))
    await dialog.getByRole("button", { name: "Terminer (bus démobilisés)" }).click();
  await page.getByTestId("prepare-send").click();
  await expect(page.getByTestId("validate-send")).toBeEnabled();
});

test("bus : n° de train, gares et arrêts tirés du référentiel des trains", async ({
  page,
}, info) => {
  const t = trains!;
  const p = info.project.name;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "/commandes/nouveau");
  await page.getByLabel("Motif").fill(`Train ${t.n} (essai)`);
  await expect(page.getByTestId("autosave")).toHaveAttribute("data-state", "saved", {
    timeout: 10_000,
  });
  fixtures.push({ col: "bus_orders", id: new URL(page.url()).searchParams.get("id") ?? "" });

  // N° de train dans un bon sans gare : gares, lignes et arrêts repris d'office.
  await page.getByTestId("train-number").fill(String(t.n));
  await expect(page.getByTestId("train-info")).toContainText(`IC ${t.n}`);
  await expect(page.getByLabel("Origine")).toHaveValue(t.alpha);
  await expect(page.getByLabel("Destination")).toHaveValue(t.delta);
  for (const line of ["L.96", "L.97"])
    await expect(page.getByRole("button", { name: line, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  const stops = page.getByTestId("route-stops");
  await expect(stops.getByRole("button", { name: t.bravo })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Passage sans arrêt : jamais proposé comme arrêt.
  await expect(stops.getByRole("button", { name: t.charlie })).toHaveCount(0);
  await expect(page.getByTestId("route-source")).toContainText("Arrêts des trains");
  await snap(page, `train-${p}`, p);

  // Annulable, puis repris à la demande.
  await page.getByTestId("train-undo").click();
  await expect(page.getByLabel("Origine")).toHaveValue("");
  await page.getByTestId("train-apply").click();
  await expect(page.getByLabel("Origine")).toHaveValue(t.alpha);

  // Nom NL (alias) accepté, nom FR retenu ; arrêts recalculés d'après les trains.
  await page.getByTestId("route-stops").getByRole("button", { name: t.bravo }).click();
  await page.getByLabel("Destination").fill(t.deltaNl);
  await page.getByLabel("Motif").focus();
  await expect(page.getByLabel("Destination")).toHaveValue(t.delta);
  await expect(stops.getByRole("button", { name: t.bravo })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("autosave")).toHaveAttribute("data-state", "saved", {
    timeout: 10_000,
  });
  expect(errors).toEqual([]);
});

test("taxi : n° de train", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "parcours en desktop");
  const t = trains!;
  await login(page, "/commandes/taxi/nouveau");
  await page.getByTestId("train-number").fill(String(t.n));
  await expect(page.getByRole("combobox", { name: "Départ", exact: true })).toHaveValue(t.alpha);
  await expect(page.getByRole("combobox", { name: "Arrivée", exact: true })).toHaveValue(t.delta);
  await expect(page.getByLabel("Heure de prise en charge")).toHaveValue("08:00");
  await expect(page.getByTestId("autosave")).toHaveAttribute("data-state", "saved", {
    timeout: 10_000,
  });
  fixtures.push({ col: "taxi_orders", id: new URL(page.url()).searchParams.get("id") ?? "" });
  await page.reload();
  await expect(page.getByTestId("train-number")).toHaveValue(String(t.n));
});

test("taxi : création liée à une société, aller-retour pré-inversé", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "parcours en desktop");
  await login(page, "/commandes/taxi/nouveau");
  // Départ rempli à la main : l'agent de la CI n'a pas de district (pas de gare par défaut).
  await page.getByRole("combobox", { name: "Départ", exact: true }).fill("Mons");
  await page.getByRole("combobox", { name: "Arrivée", exact: true }).fill("Tournai");
  await expect(page.getByTestId("autosave")).toHaveAttribute("data-state", "saved", {
    timeout: 10_000,
  });
  await page.getByRole("radio", { name: "Aller-retour" }).click();
  await expect(page.getByLabel("Départ du retour")).toHaveValue("Tournai");
  await page.getByLabel("Société de taxi").selectOption({ label: `${TAXI_COMPANY} — Mons` });
  // Heure de retour vide : relue vide, jamais « 00:00 » (régression du 14 oct. 2026).
  await expect(page.getByTestId("autosave")).toHaveAttribute("data-state", "saved", {
    timeout: 10_000,
  });
  await page.reload();
  await expect(page.getByLabel("Heure du retour")).toHaveValue("");
  await page.getByLabel("Heure du retour").fill("23:30");
  // Cycle v3 : le trajet fait, le bon passe « Terminé », puis « Valider l'envoi ».
  await page.getByTestId("transition-termine").click();
  await page.getByTestId("prepare-send").click();
  await expect(page.getByTestId("send-to")).toHaveText("dispatch@taxis-demo.invalid");
  // Dialogue centré dans la fenêtre (régression : `.chamfer` écrasait `fixed`, dialogue en bas de page).
  const box = await page.getByRole("dialog").boundingBox();
  const vp = page.viewportSize();
  expect(
    box && vp && box.y >= 0 && box.y + box.height <= vp.height,
    "dialogue visible sans défiler",
  ).toBe(true);
});

for (const t of ["nuit", "jour"] as const) {
  test(`captures ${t}`, async ({ page }, info) => {
    await login(page);
    await theme(page, t);
    const p = info.project.name;
    await page.goto("/commandes");
    await snap(page, `${t}-bus-liste`, p);
    await page.goto(busUrl || "/commandes/nouveau");
    await snap(page, `${t}-bus-fiche`, p);
    await page.goto("/commandes/taxi/nouveau");
    await snap(page, `${t}-taxi-nouveau`, p);
    await page.goto("/commandes/suivi?vue=toutes");
    await snap(page, `${t}-suivi`, p);
    await (
      p === "desktop"
        ? page.getByRole("button", { name: /Ouvrir la commande/ }).first()
        : page.getByTestId("tracking-cards").getByRole("button").first()
    ).click();
    await expect(page.getByTestId("order-panel")).toBeVisible();
    await page.screenshot({ path: `test-results/commandes-${t}-suivi-panneau-${p}.png` });
    await page.keyboard.press("Escape");
    await page.goto("/commandes/b201");
    await snap(page, `${t}-b201`, p);
  });
}
