import { expect, test, type Page } from "@playwright/test";

import { identity, login, noHorizontalScroll, password } from "./helpers";

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

test.beforeAll(async () => {
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
  for (const [line, stations] of [
    ["96", ["Bruxelles-Midi", "Hal", "Braine-le-Comte", "Soignies", "Mons"]],
  ] as const) {
    for (const [i, station] of stations.entries()) {
      const r = await pb("POST", "/api/collections/line_stations/records", {
        line: `${line}${suffix}`,
        station,
        position: i,
      });
      fixtures.push({ col: "line_stations", id: r.id });
    }
  }
});

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
      url: "http://localhost:3000",
    },
  ]);
}

async function snap(page: Page, name: string, project: string) {
  await page.waitForTimeout(500);
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/commandes-${name}-${project}.png`, fullPage: true });
}

let busUrl = "";

test("bus : création, enregistrement automatique, envoi, confirmation", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "parcours complet en desktop ; mobile en captures");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "/commandes/nouveau");

  await expect(page.getByTestId("autosave")).toHaveAttribute("data-state", "idle");
  // Valeurs par défaut : date du jour à Bruxelles, type « Remplacement ».
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(
    new Date(),
  );
  await expect(page.getByLabel("Date de circulation")).toHaveValue(today);
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
  await page.getByTestId("download-eml").click();
  await download;
  await expect(page.getByTestId("confirm-banner")).toBeVisible();
  await page.getByTestId("mark-sent").click();
  await expect(page.getByText("Envoyé", { exact: true }).first()).toBeVisible();

  // Suivi « À confirmer » : panneau latéral puis confirmation (heure et plaque facultatives).
  await page.goto("/commandes/suivi?vue=a-confirmer");
  // La commande créée par ce test (jamais une autre commande de la base).
  await page.getByRole("button", { name: `Ouvrir la commande bus n° ${number}` }).click();
  await expect(page.getByTestId("order-panel")).toBeVisible();
  await page.getByTestId("transition-confirme").click();
  await page.getByLabel("Plaque").first().fill("1-ABC-123");
  await page.getByRole("dialog").getByRole("button", { name: "Confirmer" }).click();
  await expect(
    page.getByTestId("order-panel").getByText("Confirmé", { exact: true }).first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("modèle partagé : envoi possible sans modification", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "parcours en desktop");
  await login(page, "/commandes/nouveau");
  await page.goto(`/commandes/nouveau?modele=${templateId}`);
  await expect(page.getByLabel("Motif")).toHaveValue("Travaux");
  await page.getByTestId("prepare-send").click();
  await expect(page.getByTestId("download-eml")).toBeEnabled();
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
  await page.getByTestId("prepare-send").click();
  // Contrôle avant envoi : l'heure du retour manque.
  await expect(
    page.getByRole("dialog").getByText("Date et heure du retour manquantes"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByLabel("Heure du retour").fill("23:30");
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

for (const t of ["commandement", "ivoire"] as const) {
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
