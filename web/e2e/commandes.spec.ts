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
  // Société : liste avec recherche (Combobox, refonte R2).
  await page.getByTestId("bus-company").fill(BUS_COMPANY);
  await page.getByRole("option", { name: BUS_COMPANY }).click();
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

test("bus : barre d'actions mobile (une action principale + feuille « ⋯ »)", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile", "barre d'actions mobile (< 768 px)");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const agent = await pb(
    "GET",
    `/api/collections/users/records?filter=${encodeURIComponent(`email="${identity}"`)}`,
  );
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(
    new Date(),
  );
  const order = await pb("POST", "/api/collections/bus_orders/records", {
    status: "brouillon",
    created_by: agent.items[0].id,
    reason: "Barre d'actions mobile (essai)",
    order_date: `${today} 00:00:00.000Z`,
    origin: "Mons",
    destination: "Soignies",
    company: fixtures.find((f) => f.col === "bus_companies")!.id,
    buses: [{ planned: "08:00" }],
  });
  await login(page, `/commandes/bus/${order.id}`);
  const bar = page.getByTestId("order-action-bar");
  await expect(bar).toBeVisible();
  // Une seule action visible (Terminer), pleine largeur ; l'annulation n'est plus dans la barre.
  const main = bar.getByTestId("transition-termine");
  await expect(main).toBeVisible();
  await expect(bar.getByTestId("transition-annule")).toBeHidden();
  const [barBox, mainBox] = [await bar.boundingBox(), await main.boundingBox()];
  expect(mainBox!.width).toBeGreaterThan(barBox!.width * 0.7);
  // Hauteur fixe en bas d'écran : barre d'actions + barre d'onglets (≈ 190 px avant la refonte R6).
  const fixed = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-testid="order-action-bar"]')!;
    return Math.round(window.innerHeight - el.getBoundingClientRect().top);
  });
  info.annotations.push({ type: "hauteur fixe (px)", description: String(fixed) });
  expect(fixed).toBeLessThanOrEqual(125);
  await noHorizontalScroll(page);
  // Segmented « Type C3 » : aucun libellé coupé en 390 px (passe en grille si besoin).
  const cut = await page
    .getByRole("radiogroup", { name: "Type C3" })
    .getByRole("radio")
    .evaluateAll((els) =>
      els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent),
    );
  expect(cut).toEqual([]);
  await page.screenshot({ path: `test-results/r5r6-bus-barre-${info.project.name}.png` });

  await bar.getByTestId("order-more").click();
  const sheet = page.getByTestId("order-actions-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Aperçu PDF")).toBeVisible();
  const cancel = sheet.getByTestId("sheet-transition-annule");
  await expect(cancel).toBeVisible();
  // Annulation séparée, en bas, en rouge.
  // (« Supprimer le bon », s'il est permis, vient encore après : 14 oct. 2026.)
  const ids = await sheet
    .locator("a, button")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid") ?? ""));
  expect(ids.filter((i) => i !== "sheet-delete-order").at(-1)).toBe("sheet-transition-annule");
  await page.waitForTimeout(400); // fin de l'animation de la feuille
  await page.screenshot({ path: `test-results/r5r6-bus-feuille-${info.project.name}.png` });

  // Le dialogue de motif s'ouvre après la fermeture de la feuille (il n'est pas démonté avec elle).
  await cancel.click();
  const dialog = page.getByRole("dialog", { name: "Annuler la commande" });
  await expect(dialog).toBeVisible();
  await expect(sheet).toBeHidden();
  const motif = dialog.getByLabel("Motif d'annulation");
  await expect(motif).toBeVisible();
  await motif.fill("Essai de la feuille mobile");
  await page.waitForTimeout(300);
  const box = await dialog.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844 + 1);
  await dialog.getByRole("button", { name: "Annuler la commande" }).click();
  await expect(page.getByText(/annuler la commande — fait/i)).toBeVisible();
  const after = await pb("GET", `/api/collections/bus_orders/records/${order.id}`);
  expect(after.status).toBe("annule");
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
  await page.getByTestId("taxi-company").fill(TAXI_COMPANY);
  await page
    .getByRole("option", { name: new RegExp(TAXI_COMPANY) })
    .first()
    .click();
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

// Captures demandées pour la revue (hors dépôt) : dossier de l'agent, sinon test-results.
const SHOTS = process.env.E2E_SHOTS_DIR ?? "test-results";

async function agentId(): Promise<string> {
  const a = await pb(
    "GET",
    `/api/collections/users/records?filter=${encodeURIComponent(`email="${identity}"`)}`,
  );
  return a.items[0].id as string;
}

test("taxi PMR : deux gares via (ordonnées) et n° de dossier", async ({ page }, info) => {
  const p = info.project.name;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "/commandes/taxi/nouveau");
  await page.getByRole("combobox", { name: "Départ", exact: true }).fill("Mons");
  await page.getByRole("combobox", { name: "Arrivée", exact: true }).fill("Tournai");
  // Liste ordonnée d'étapes : ajout, saisie, descendre / monter.
  await page.getByTestId("via-add").click();
  await page.getByTestId("via-input-0").fill("Frameries");
  await page.getByTestId("via-add").click();
  await page.getByTestId("via-input-1").fill("Ghlin");
  await page.getByTestId("via-input-1").press("Tab");
  await page.getByTestId("via-down-0").click();
  await expect(page.getByTestId("via-input-0")).toHaveValue("Ghlin");
  await expect(page.getByTestId("via-input-1")).toHaveValue("Frameries");
  await page.getByTestId("via-up-1").click();
  await expect(page.getByTestId("via-input-0")).toHaveValue("Frameries");
  // Une 3e étape ajoutée puis retirée.
  await page.getByTestId("via-add").click();
  await page.getByTestId("via-remove-2").click();
  await expect(page.getByTestId("via-input-2")).toHaveCount(0);

  // Taxi PMR : « Numéro de dossier » (AAAA-MM-JJ-NNNN), saisie remise au format, message si hors format.
  await page.getByRole("radio", { name: "PMR", exact: true }).click();
  await expect(page.getByText("Référence / relation")).toHaveCount(0);
  const file = page.getByTestId("pmr-file");
  await file.fill("1234");
  await file.press("Tab");
  await expect(page.getByText(/N° de dossier inattendu/)).toBeVisible();
  await file.fill("20261014134");
  await file.press("Tab");
  await expect(file).toHaveValue("2026-10-14-0134");
  await expect(page.getByText(/N° de dossier inattendu/)).toHaveCount(0);
  await expect(page.getByTestId("autosave")).toHaveAttribute("data-state", "saved", {
    timeout: 10_000,
  });
  const id = new URL(page.url()).searchParams.get("id") ?? "";
  expect(id).not.toBe("");
  fixtures.push({ col: "taxi_orders", id });
  const rec = await pb("GET", `/api/collections/taxi_orders/records/${id}`);
  expect(rec.via_stations).toEqual(["Frameries", "Ghlin"]);
  expect(rec.via_station).toBe("Frameries · Ghlin");
  expect(rec.pmr_file).toBe("2026-10-14-0134");

  await page.reload();
  await expect(page.getByTestId("via-input-0")).toHaveValue("Frameries");
  await expect(page.getByTestId("via-input-1")).toHaveValue("Ghlin");
  await expect(page.getByTestId("pmr-file")).toHaveValue("2026-10-14-0134");
  if (p === "desktop")
    await expect(page.getByTestId("preview-via")).toHaveText("Frameries → Ghlin");
  await noHorizontalScroll(page);
  await page.screenshot({ path: `${SHOTS}/taxi-pmr-via-dossier-${p}.png`, fullPage: true });

  // Repris dans le panneau du Suivi (trajet complet + n° de dossier).
  if (p === "desktop") {
    const n = /n° (\d+)/.exec((await page.getByTestId("order-number").textContent()) ?? "")?.[1];
    await page.goto("/commandes/suivi?vue=en-cours&type=taxi");
    await page.getByRole("button", { name: `Ouvrir la commande taxi n° ${n}` }).click();
    const panel = page.getByTestId("order-panel");
    await expect(panel).toContainText("Mons → Frameries → Ghlin → Tournai");
    await expect(panel).toContainText("2026-10-14-0134");
  }
  expect(errors).toEqual([]);
});

test("suppression d'un bon par son créateur (confirmation, retour à la liste)", async ({
  page,
}, info) => {
  const p = info.project.name;
  await login(page, "/commandes/taxi/nouveau");
  await page.getByRole("combobox", { name: "Départ", exact: true }).fill("Mons");
  await page.getByRole("combobox", { name: "Arrivée", exact: true }).fill("Jurbise");
  await expect(page.getByTestId("autosave")).toHaveAttribute("data-state", "saved", {
    timeout: 10_000,
  });
  const id = new URL(page.url()).searchParams.get("id") ?? "";
  const n = /n° (\d+)/.exec((await page.getByTestId("order-number").textContent()) ?? "")?.[1];
  fixtures.push({ col: "taxi_orders", id });
  // Fiche rechargée : droit calculé par le serveur.
  await page.goto(`/commandes/taxi/${id}`);
  if (p === "desktop") {
    await page
      .getByTestId("order-action-bar")
      .getByRole("button", { name: "Plus d'actions" })
      .first()
      .click();
    await page.getByTestId("menu-delete-order").click();
  } else {
    await page.getByTestId("order-more").click();
    await expect(page.getByTestId("sheet-delete-order")).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/feuille-actions-supprimer-${p}.png` });
    await page.getByTestId("sheet-delete-order").click();
  }
  await expect(page.getByTestId("delete-order-question")).toHaveText(
    `Supprimer définitivement le bon taxi n° ${n} ?`,
  );
  if (p === "desktop") await page.screenshot({ path: `${SHOTS}/supprimer-confirmation-${p}.png` });
  await page.getByTestId("delete-order-confirm").click();
  await expect(page).toHaveURL(/\/commandes\/taxi$/, { timeout: 10_000 });
  const res = await fetch(`${PB}/api/collections/taxi_orders/records/${id}`, {
    headers: { authorization: root },
  });
  expect(res.status).toBe(404);
});

test("bon envoyé il y a plus de 30 jours : dans Archives, plus dans le Suivi", async ({
  page,
}, info) => {
  const p = info.project.name;
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();
  const station = `Archivegare ${suffix} ${p}`;
  const old = await pb("POST", "/api/collections/taxi_orders/records", {
    status: "envoye",
    created_by: await agentId(),
    from_station: station,
    to_station: "Tournai",
    via_stations: ["Ath"],
    via_station: "Ath",
    trip_at: day(-41).replace("T", " "),
    sent_at: day(-40).replace("T", " "),
    trip_type: "aller",
  });
  fixtures.push({ col: "taxi_orders", id: old.id });
  await login(page, "/commandes/taxi");
  await page.goto(`/commandes/taxi?q=${encodeURIComponent(station)}`);
  await expect(page.getByTestId("orders-count")).toHaveText(/^\s*0\s+commandes/);
  await page.goto("/commandes/suivi?vue=toutes&type=taxi");
  await expect(
    page.getByRole("button", { name: `Ouvrir la commande taxi n° ${old.number}` }),
  ).toHaveCount(0);
  await page.goto("/commandes/archives");
  const list = page.getByTestId("archived-orders");
  await expect(list).toContainText(station);
  await expect(list.getByTestId("archived-badge").filter({ visible: true }).first()).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: `${SHOTS}/archives-bons-${p}.png`, fullPage: true });
  // Filtre par type et recherche.
  await page.goto(`/commandes/archives?type=taxi&q=${encodeURIComponent(station)}`);
  await expect(page.getByTestId("archived-count")).toContainText("1 bon archivé");
  // Lien direct vers la fiche : lecture seule, badge « Archivé ».
  await page.goto(`/commandes/taxi/${old.id}`);
  await expect(page.getByTestId("archived-badge")).toBeVisible();
  await expect(page.getByText("Lecture seule")).toBeVisible();
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
