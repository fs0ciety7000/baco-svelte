import { expect, test, type Page, type Response } from "@playwright/test";

import { identity, login, noHorizontalScroll, password } from "./helpers";

// Annuaire (Ressources › Annuaire, refonte du 14 oct. 2026) : recherche instantanée sans accent ni majuscule, mots dans
// le désordre, faute de frappe, numéro avec espaces / +32, appel (etrali: au poste, tel: au téléphone), copie du
// numéro, favori qui persiste au rechargement. Fiches FICTIVES créées par le superuser, supprimées à la fin.

const PB = (process.env.PB_URL ?? "http://127.0.0.1:8090").replace(/\/$/, "");
const suEmail = process.env.PB_SUPERUSER_EMAIL ?? "";
const suPassword = process.env.PB_SUPERUSER_PASSWORD ?? "";
test.skip(!identity || !password || !suEmail, "E2E_IDENTITY / PB_SUPERUSER_* non définis");
test.describe.configure({ mode: "serial" });

let root = "";
const created: string[] = [];
// Suffixe propre au projet (desktop / mobile tournent en parallèle sur la même base).
let tag = "";
let digits = "";

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
  const letters = "bcdfghjklmnpqrstvwxz";
  tag = `${info.project.name === "mobile" ? "Mob" : "Dsk"}${Array.from(
    { length: 5 },
    () => letters[Math.floor(Math.random() * letters.length)],
  ).join("")}`;
  digits = String(Math.floor(1_000_000 + Math.random() * 8_999_999));
  const rows = [
    {
      name: `Gare de Liège-Guillemins ${tag}`,
      phone: `+32 4 ${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5)}`,
      email: `guichet.${tag.toLowerCase()}@exemple.invalid`,
      category: "GARE",
      group: `Gares ${tag}`,
      note: "Fiche fictive (E2E)",
    },
    {
      name: `Dispatching Sécurité ${tag}`,
      phone: "02 000 00 00",
      category: "SERVICE",
      group: `Dispatching ${tag}`,
      note: "Fiche fictive (E2E)",
    },
  ];
  for (const r of rows) {
    const rec = await pb("POST", "/api/collections/directory_contacts/records", r);
    created.push(rec.id);
  }
});

test.afterAll(async () => {
  for (const id of created) await pb("DELETE", `/api/collections/directory_contacts/records/${id}`);
});

const search = (page: Page) => page.getByTestId("directory-search");
const dispatchId = () => created[1]!;
// Réponse d'une Server Action qui porte l'identifiant de la fiche (les compteurs de la barre latérale postent aussi).
const forContact = (id: string) => (r: Response) =>
  r.request().method() === "POST" && r.ok() && (r.request().postData() ?? "").includes(id);
const rows = (page: Page) => page.getByTestId("contact-row");

test("recherche tolérante : accents, désordre, faute de frappe, numéro", async ({ page }) => {
  await login(page, "/referentiels");
  await expect(search(page)).toBeVisible();
  await noHorizontalScroll(page);

  // Sans accent ni majuscule, mots dans le désordre : un seul résultat, surligné.
  await search(page).fill(`guillemins liege ${tag.toLowerCase()}`);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(`Gare de Liège-Guillemins ${tag}`);
  await expect(rows(page).first().locator("mark").first()).toBeVisible();

  // Faute de frappe (transposition) : trouvée au second passage.
  await search(page).fill(`dispacthing ${tag.toLowerCase()}`);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(`Dispatching Sécurité ${tag}`);

  // Numéro : forme nationale avec espaces (la fiche est enregistrée en +32).
  await search(page).fill(`04 ${digits.slice(0, 3)} ${digits.slice(3, 5)}`);
  await expect(rows(page).filter({ hasText: tag })).toHaveCount(1);
  await expect(page.getByTestId("contacts-count")).toContainText("résultat");

  // Rien : état vide qui reprend la saisie.
  await search(page).fill(`zzqx${tag}`);
  await expect(page.getByText(`Aucun résultat pour « zzqx${tag} »`)).toBeVisible();

  // L'URL garde la recherche (lien partageable) et la rejoue au rendu serveur.
  await search(page).fill(`liege ${tag.toLowerCase()}`);
  await expect(page).toHaveURL(/q=liege/);
  await page.reload();
  await expect(search(page)).toHaveValue(`liege ${tag.toLowerCase()}`);
  await expect(rows(page)).toHaveCount(1);
  await noHorizontalScroll(page);
});

test("appel et copie du numéro, fiche en panneau", async ({ page, context }, info) => {
  const mobile = info.project.name === "mobile";
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page, "/referentiels");
  await search(page).fill(`liege ${tag.toLowerCase()}`);
  await expect(rows(page)).toHaveCount(1);
  const row = rows(page).first();
  if (mobile) {
    // Appel direct au pouce : lien tel:, cible ≥ 44 px.
    const call = row.getByTestId("contact-call-mobile");
    await expect(call).toHaveAttribute("href", `tel:+324${digits}`);
    const box = await call.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  } else {
    await expect(row.getByTestId("contact-call")).toHaveAttribute("href", `etrali:+324${digits}`);
    await row.getByTestId("contact-copy").click();
    await expect(row.getByTestId("contact-copy")).toHaveAccessibleName("Numéro copié");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.replace(/\D/g, "")).toBe(`324${digits}`);
  }
  // Panneau : numéro en grand, Appeler + Copier.
  await row.locator("[data-row-open]").click();
  const panel = page.getByTestId("contact-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("contact-panel-phone")).toContainText(digits.slice(5));
  await expect(
    panel.getByRole("link", { name: "Appeler" }).filter({ visible: true }),
  ).toHaveAttribute("href", mobile ? `tel:+324${digits}` : `etrali:+324${digits}`);
  await panel.getByRole("button", { name: "Copier le numéro" }).click();
  await expect(panel.getByRole("button", { name: "Copié" })).toBeVisible();
  await expect(page).toHaveURL(/id=[a-z0-9]{15}/);
});

test("favori qui persiste et consultés récemment", async ({ page }, info) => {
  // Une seule session écrit les préférences (desktop et mobile partagent le compte de test).
  test.skip(info.project.name === "mobile", "préférences du compte écrites par le projet desktop");
  await login(page, "/referentiels");
  await search(page).fill(`dispatching ${tag.toLowerCase()}`);
  await expect(rows(page)).toHaveCount(1);
  const fav = rows(page).first().getByTestId("contact-fav");
  await expect(fav).toHaveAttribute("aria-pressed", "false");
  const starred = page.waitForResponse(forContact(dispatchId()));
  await fav.click();
  await starred;
  await expect(fav).toHaveAttribute("aria-pressed", "true");
  // Ouvrir la fiche la place dans « Consultés récemment » (deux Server Actions : fiche + récent).
  let posts = 0;
  const both = page.waitForResponse((r) => forContact(dispatchId())(r) && ++posts >= 2);
  await rows(page).first().locator("[data-row-open]").click();
  await expect(page.getByTestId("contact-panel")).toBeVisible();
  await both;

  await page.goto("/referentiels");
  const favorites = page.getByTestId("directory-favorites");
  await expect(favorites).toContainText(`Dispatching Sécurité ${tag}`);
  // Un favori n'est pas répété dans « Consultés récemment ».
  await expect(
    page.getByTestId("directory-recent").filter({ hasText: `Dispatching Sécurité ${tag}` }),
  ).toHaveCount(0);
  await noHorizontalScroll(page);

  // Retrait du favori (le compte de test revient à son état) : attendre la Server Action avant de recharger.
  const saved = page.waitForResponse(forContact(dispatchId()));
  await favorites
    .getByTestId("contact-row")
    .filter({ hasText: tag })
    .getByTestId("contact-fav")
    .click();
  await saved;
  await page.reload();
  await expect(page.getByTestId("directory-recent")).toContainText(`Dispatching Sécurité ${tag}`);
});
