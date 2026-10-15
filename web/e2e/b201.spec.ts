import { expect, test, type Page } from "@playwright/test";

import {
  adminIdentity,
  identity,
  login,
  loginAdmin,
  noHorizontalScroll,
  password,
} from "./helpers";

// B201 (15 oct. 2026) : la Relève devient « B201 » (Opérations) ; ses notes du jour, en Markdown, s'écrivent PAR
// DISTRICT (une fiche par jour et par district). Les notes d'avant (sans district) restent en lecture seule. Jours
// fictifs lointains (aucune donnée réelle touchée), fiches supprimées à la fin.

const PB = (process.env.PB_URL ?? "http://127.0.0.1:8090").replace(/\/$/, "");
const suEmail = process.env.PB_SUPERUSER_EMAIL ?? "";
const suPassword = process.env.PB_SUPERUSER_PASSWORD ?? "";
const shots = process.env.E2E_SHOTS_DIR ?? "test-results";
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
const rand = () => 1 + Math.floor(Math.random() * 27);
const dayFor = (project: string, n: number) =>
  `20${project === "desktop" ? 41 : 42}-0${n}-${String(rand()).padStart(2, "0")}`;
const q = (filter: string) => `?filter=${encodeURIComponent(filter)}&perPage=50`;

async function removeDay(day: string) {
  for (const c of ["b201_reports", "b201_notes"]) {
    const list = await pb("GET", `/api/collections/${c}/records${q(`day="${day}"`)}`);
    for (const r of list?.items ?? []) await pb("DELETE", `/api/collections/${c}/records/${r.id}`);
  }
}

/** Éditeur des notes d'un district : en mobile (onglets), l'onglet est d'abord choisi. */
async function districtNotes(page: Page, project: string, district: string) {
  if (project === "mobile") await page.getByTestId(`b201-notes-tab-${district}`).click();
  const box = page.getByTestId(`b201-notes-${district}`);
  await expect(box).toBeVisible();
  return box;
}

test.beforeAll(async () => {
  root = (
    await pb("POST", "/api/collections/_superusers/auth-with-password", {
      identity: suEmail,
      password: suPassword,
    })
  ).token;
});

test("B201 : notes séparées par district, PDF, versions", async ({ page, request }, info) => {
  const project = info.project.name;
  const day = dayFor(project, 1);
  await removeDay(day);
  try {
    await login(page, "/operations/b201");
    await page.goto(`/operations/b201?jour=${day}&district=DSO&district=DSE`);
    await expect(page.getByRole("link", { name: "B201", exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("b201-notes")).toBeVisible();
    // Deux districts : un éditeur chacun ; en mobile, en onglets (un seul visible).
    await expect(page.getByTestId("b201-notes-DCE")).toHaveCount(0);
    if (project === "mobile") {
      await expect(page.getByTestId("b201-notes-DSO")).toBeVisible();
      await expect(page.getByTestId("b201-notes-DSE")).toBeHidden();
    } else {
      await expect(page.getByTestId("b201-notes-DSO")).toBeVisible();
      await expect(page.getByTestId("b201-notes-DSE")).toBeVisible();
      await expect(page.getByTestId("b201-notes-tab-DSO")).toBeHidden();
    }

    const dso = await districtNotes(page, project, "DSO");
    const input = dso.getByTestId("b201-notes-input");
    await input.fill("### Matin\nBus Mons → Quévy : ");
    await input.press("End");
    // Barre d'outils : gras sans sélection insère un texte d'exemple sélectionné, remplacé à la frappe.
    await dso.getByTestId("md-bold").click();
    await page.keyboard.type("chauffeur prévenu");
    await expect(input).toHaveValue("### Matin\nBus Mons → Quévy : **chauffeur prévenu**");
    await expect(dso.getByTestId("autosave")).toHaveAttribute("data-state", "saved", {
      timeout: 15000,
    });
    if (project === "mobile") await dso.getByRole("radio", { name: "Aperçu" }).click();
    await expect(dso.getByTestId("b201-notes-preview").locator("strong")).toHaveText(
      "chauffeur prévenu",
    );
    await expect(dso.getByTestId("b201-last-edit")).toContainText("Modifié à");

    const dse = await districtNotes(page, project, "DSE");
    await dse.getByTestId("b201-notes-input").fill("Namur : rampe en réparation");
    await expect(dse.getByTestId("autosave")).toHaveAttribute("data-state", "saved", {
      timeout: 15000,
    });
    await noHorizontalScroll(page);
    await page.screenshot({ path: `${shots}/b201-notes-${project}.png`, fullPage: true });

    // Deux fiches distinctes (jour + district), chacune avec son texte.
    const rows = await pb("GET", `/api/collections/b201_notes/records${q(`day="${day}"`)}`);
    const byDistrict = Object.fromEntries(
      (rows?.items ?? []).map((r: { district: string; content: string }) => [
        r.district,
        r.content,
      ]),
    );
    expect(byDistrict).toEqual({
      DSO: "### Matin\nBus Mons → Quévy : **chauffeur prévenu**",
      DSE: "Namur : rampe en réparation",
    });

    // Rechargée : chaque district garde son texte ; un seul district → un seul éditeur, sans onglets.
    await page.reload();
    await expect(
      (await districtNotes(page, project, "DSO")).getByTestId("b201-notes-input"),
    ).toHaveValue(/\*\*chauffeur prévenu\*\*/);
    await expect(
      (await districtNotes(page, project, "DSE")).getByTestId("b201-notes-input"),
    ).toHaveValue("Namur : rampe en réparation");
    await page.goto(`/operations/b201?jour=${day}&district=DSE`);
    await expect(page.getByTestId("b201-notes-DSE")).toBeVisible();
    await expect(page.getByTestId("b201-notes-DSO")).toHaveCount(0);
    await expect(page.getByTestId("b201-notes-tab-DSE")).toHaveCount(0);

    // PDF de la B201 (notes par district + transports) servi au même agent.
    const pdf = await page.request.get(`/api/commandes/b201/${day}/pdf?district=DSO&district=DSE`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");

    // Ancienne route : redirection permanente, jour gardé.
    const r = await request.get(`/ressources/b201?jour=${day}`, { maxRedirects: 0 });
    expect(r.status()).toBe(308);
    expect(r.headers()["location"]).toBe(`/operations/b201?jour=${day}`);

    // Un autre agent modifie les notes DSO : la version précédente est gardée et restaurable ; DSE ne bouge pas.
    if (adminIdentity && project === "desktop") {
      await loginAdmin(page, "/");
      await page.goto(`/operations/b201?jour=${day}&district=DSO&district=DSE`);
      const adminDso = page.getByTestId("b201-notes-DSO");
      await adminDso.getByTestId("b201-notes-input").fill("Texte remplacé par l'admin");
      await expect(adminDso.getByTestId("autosave")).toHaveAttribute("data-state", "saved", {
        timeout: 15000,
      });
      await page.reload();
      await page.getByTestId("b201-notes-DSO").getByTestId("b201-versions").click();
      const dialog = page.getByRole("dialog", { name: "Versions du jour · DSO" });
      await expect(dialog).toContainText("chauffeur prévenu");
      await dialog.getByRole("button", { name: "Reprendre ce texte" }).click();
      await expect(page.getByTestId("b201-notes-DSO").getByTestId("b201-notes-input")).toHaveValue(
        /chauffeur prévenu/,
      );
      await expect(page.getByTestId("b201-notes-DSE").getByTestId("b201-versions")).toHaveCount(0);
    }
  } finally {
    await removeDay(day);
  }
});

test("B201 : notes d'avant le 15 oct. en lecture seule, une fois", async ({ page }, info) => {
  const day = dayFor(info.project.name, 2);
  await removeDay(day);
  const agent = await pb("GET", `/api/collections/users/records${q(`email="${identity}"`)}`);
  const rec = await pb("POST", "/api/collections/b201_reports/records", {
    day,
    notes: {
      matin: "Ancien commentaire du matin",
      apres_midi: "",
      nuit: "",
      suivant: "Pour la suite",
    },
    manual: [],
    updated_by: agent.items[0].id,
  });
  try {
    await login(page, "/operations/b201");
    await page.goto(`/operations/b201?jour=${day}&district=DSO&district=DCE`);
    const common = page.getByTestId("b201-common");
    await expect(common).toHaveCount(1);
    await expect(common).toContainText("Notes communes (avant le 15 oct.)");
    await expect(common).toContainText("Ancien commentaire du matin");
    await expect(common).toContainText("Pour le service suivant");
    await expect(common.locator("textarea")).toHaveCount(0);
    // Les districts partent vides : le texte commun n'est recopié nulle part.
    await expect(
      (await districtNotes(page, info.project.name, "DSO")).getByTestId("b201-notes-input"),
    ).toHaveValue("");
    await noHorizontalScroll(page);
  } finally {
    if (rec?.id) await pb("DELETE", `/api/collections/b201_reports/records/${rec.id}`);
    await removeDay(day);
  }
});

test("B201 : « Copier la relève » sans les notes (aujourd'hui)", async ({ page }) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(
    new Date(),
  );
  // Notes DSO du jour : créées pour le test si absentes (base locale), sinon reprises telles quelles.
  const found = await pb(
    "GET",
    `/api/collections/b201_notes/records${q(`day="${today}" && district="DSO"`)}`,
  );
  let created = "";
  let marker = String(found?.items?.[0]?.content ?? "").trim();
  if (!found?.items?.length) {
    marker = `Note E2E ${Date.now()}`;
    created = (
      await pb("POST", "/api/collections/b201_notes/records", {
        day: today,
        district: "DSO",
        content: marker,
      })
    ).id;
  }
  try {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (t: string) => {
            (window as unknown as { __copied: string }).__copied = t;
          },
        },
      });
    });
    await login(page, "/operations/b201");
    await page.goto("/operations/b201?district=DSO");
    await expect(page.getByTestId("handover")).toBeVisible();
    await expect(page.getByText("Missions et groupes à venir").first()).toBeVisible();
    await expect(page.getByTestId("b201-notes-DSO")).toBeVisible();
    await page.getByTestId("handover-copy").click();
    await expect(page.getByTestId("handover-copy")).toContainText("Copié");
    const copied = await page.evaluate(() => (window as unknown as { __copied: string }).__copied);
    expect(copied).toContain("Relève DSO");
    expect(copied).not.toContain("Notes B201");
    if (marker.length > 5) expect(copied).not.toContain(marker.slice(0, 60));
    await noHorizontalScroll(page);
  } finally {
    if (created) await pb("DELETE", `/api/collections/b201_notes/records/${created}`);
  }
});
