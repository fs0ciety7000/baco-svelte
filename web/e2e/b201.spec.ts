import { expect, test } from "@playwright/test";

import {
  adminIdentity,
  identity,
  login,
  loginAdmin,
  noHorizontalScroll,
  password,
} from "./helpers";

// B201 (15 oct. 2026) : la Relève devient « B201 » (Opérations) avec des notes du jour en Markdown qui remplacent la
// remise de Ressources › B201. Jours fictifs lointains (aucune donnée réelle touchée), fiches supprimées à la fin.

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
const rand = () => 1 + Math.floor(Math.random() * 27);
const dayFor = (project: string, n: number) =>
  `20${project === "desktop" ? 41 : 42}-0${n}-${String(rand()).padStart(2, "0")}`;

async function removeDay(day: string) {
  const list = await pb(
    "GET",
    `/api/collections/b201_reports/records?filter=${encodeURIComponent(`day="${day}"`)}`,
  );
  for (const r of list?.items ?? [])
    await pb("DELETE", `/api/collections/b201_reports/records/${r.id}`);
}

test.beforeAll(async () => {
  root = (
    await pb("POST", "/api/collections/_superusers/auth-with-password", {
      identity: suEmail,
      password: suPassword,
    })
  ).token;
});

test("B201 : notes Markdown enregistrées, PDF, versions", async ({ page, request }, info) => {
  const day = dayFor(info.project.name, 1);
  await removeDay(day);
  try {
    await login(page, "/operations/b201");
    await page.goto(`/operations/b201?jour=${day}&district=tous`);
    await expect(page.getByRole("link", { name: "B201", exact: true }).first()).toBeVisible();
    const notes = page.getByTestId("b201-notes");
    await expect(notes).toBeVisible();
    const input = notes.getByTestId("b201-notes-input");
    await input.fill("### Matin\nBus Mons → Quévy : ");
    await input.press("End");
    // Barre d'outils : gras sans sélection insère un texte d'exemple sélectionné, remplacé à la frappe.
    await notes.getByTestId("md-bold").click();
    await page.keyboard.type("chauffeur prévenu");
    await expect(input).toHaveValue("### Matin\nBus Mons → Quévy : **chauffeur prévenu**");
    await expect(notes.getByTestId("autosave")).toHaveAttribute("data-state", "saved", {
      timeout: 15000,
    });
    if (info.project.name === "mobile") {
      await notes.getByRole("radio", { name: "Aperçu" }).click();
    }
    await expect(notes.getByTestId("b201-notes-preview").locator("strong")).toHaveText(
      "chauffeur prévenu",
    );
    await expect(notes.getByTestId("b201-last-edit")).toContainText("Modifié à");
    await noHorizontalScroll(page);
    await page.screenshot({
      path: `test-results/b201-notes-${info.project.name}.png`,
      fullPage: true,
    });

    // Rechargée : le texte est gardé.
    await page.reload();
    await expect(page.getByTestId("b201-notes-input")).toHaveValue(/\*\*chauffeur prévenu\*\*/);

    // PDF de la B201 (notes + transports) servi au même agent.
    const pdf = await page.request.get(`/api/commandes/b201/${day}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");

    // Ancienne route : redirection permanente, jour gardé.
    const r = await request.get(`/ressources/b201?jour=${day}`, { maxRedirects: 0 });
    expect(r.status()).toBe(308);
    expect(r.headers()["location"]).toBe(`/operations/b201?jour=${day}`);

    // Un autre agent modifie : la version précédente est gardée et restaurable.
    if (adminIdentity && info.project.name === "desktop") {
      await loginAdmin(page, "/");
      await page.goto(`/ressources/b201?jour=${day}&district=tous`);
      await expect(page).toHaveURL(new RegExp(`/operations/b201\\?jour=${day}`));
      const input2 = page.getByTestId("b201-notes-input");
      await input2.fill("Texte remplacé par l'admin");
      await expect(page.getByTestId("autosave")).toHaveAttribute("data-state", "saved", {
        timeout: 15000,
      });
      await page.reload();
      await page.getByTestId("b201-versions").click();
      const dialog = page.getByRole("dialog", { name: "Versions du jour" });
      await expect(dialog).toContainText("chauffeur prévenu");
      await dialog.getByRole("button", { name: "Reprendre ce texte" }).click();
      await expect(page.getByTestId("b201-notes-input")).toHaveValue(/chauffeur prévenu/);
    }
  } finally {
    await removeDay(day);
  }
});

test("B201 : anciens commentaires par période repris en Markdown", async ({ page }, info) => {
  const day = dayFor(info.project.name, 2);
  await removeDay(day);
  const agent = await pb(
    "GET",
    `/api/collections/users/records?filter=${encodeURIComponent(`email="${identity}"`)}`,
  );
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
    await page.goto(`/operations/b201?jour=${day}&district=tous`);
    const input = page.getByTestId("b201-notes-input");
    await expect(input).toHaveValue(
      "### Matin\nAncien commentaire du matin\n\n### Pour le service suivant\nPour la suite",
    );
    await noHorizontalScroll(page);
  } finally {
    if (rec?.id) await pb("DELETE", `/api/collections/b201_reports/records/${rec.id}`);
  }
});

test("B201 : la synthèse de la relève reste (aujourd'hui)", async ({ page }) => {
  await login(page, "/operations/b201");
  await page.goto("/operations/b201?district=tous");
  await expect(page.getByTestId("handover")).toBeVisible();
  await expect(page.getByText("Missions et groupes à venir").first()).toBeVisible();
  await expect(page.getByTestId("b201-notes")).toBeVisible();
  await noHorizontalScroll(page);
});
