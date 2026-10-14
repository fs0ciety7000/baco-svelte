import { expect, test, type Page } from "@playwright/test";

import { noHorizontalScroll } from "./helpers";

// « Voir en tant que » (Administration, 14 oct. 2026) : le compte admin de test (E2E_ADMIN_*) voit CSM comme le compte
// PACO/RCCA de test (E2E_IDENTITY), en lecture seule ; bandeau, navigation de la cible, écritures refusées, retour.
// Lancé avec CSM_INTERNAL_SECRET sur le web ET PocketBase (sinon le bouton n'existe pas : test sauté).

const adminId = process.env.E2E_ADMIN_IDENTITY ?? "";
const adminPw = process.env.E2E_ADMIN_PASSWORD ?? "";
const pacoIdentity = process.env.E2E_IDENTITY ?? "";
const pbUrl = process.env.PB_URL ?? "http://127.0.0.1:8090";
const su = {
  email: process.env.PB_SUPERUSER_EMAIL ?? "",
  password: process.env.PB_SUPERUSER_PASSWORD ?? "",
};
const shots = process.env.E2E_SHOTS_DIR ?? "";

test.skip(
  !adminId || !adminPw || !pacoIdentity || !su.email || !su.password,
  "E2E_ADMIN_*, E2E_IDENTITY ou PB_SUPERUSER_* non définis",
);

async function targetId(): Promise<string> {
  const auth = await fetch(`${pbUrl}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identity: su.email, password: su.password }),
  });
  const { token } = (await auth.json()) as { token: string };
  const field = pacoIdentity.includes("@") ? "email" : "username";
  const res = await fetch(
    `${pbUrl}/api/collections/users/records?perPage=1&fields=id,role&filter=${encodeURIComponent(`${field}="${pacoIdentity.replace(/"/g, "")}"`)}`,
    { headers: { authorization: token } },
  );
  const user = ((await res.json()) as { items: { id: string; role: string }[] }).items[0];
  if (!user) throw new Error("compte E2E introuvable");
  return user.id;
}

async function loginAdmin(page: Page) {
  await page.goto("/connexion");
  await page.getByLabel("E-mail ou identifiant").fill(adminId);
  await page.getByLabel("Mot de passe").fill(adminPw);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("voir en tant que : PACO/RCCA en lecture seule, puis retour", async ({ page }, info) => {
  const id = await targetId();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loginAdmin(page);
  await page.goto(`/admin/utilisateurs/${id}`);
  const open = page.getByTestId("impersonate-open");
  test.skip(!(await open.isVisible()), "CSM_INTERNAL_SECRET absent : fonction coupée");
  await noHorizontalScroll(page);
  if (shots) await page.screenshot({ path: `${shots}/en-tant-que-fiche-${info.project.name}.png` });

  await open.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("en lecture seule, 30 minutes au plus");
  await dialog.getByTestId("impersonate-confirm").click();
  await expect(page).toHaveURL(/\/$/);

  // Bandeau sur toutes les pages, sans défilement horizontal.
  const banner = page.getByTestId("acting-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("PACO/RCCA");
  await noHorizontalScroll(page);
  if (shots)
    await page.screenshot({ path: `${shots}/en-tant-que-bandeau-${info.project.name}.png` });
  // Le bandeau ne recouvre pas la barre du haut.
  const bannerBox = await banner.boundingBox();
  const topbar = page.locator("header").first();
  const topbarBox = await topbar.boundingBox();
  expect(bannerBox && topbarBox && topbarBox.y >= bannerBox.y + bannerBox.height - 1).toBe(true);

  // Navigation de la cible : pas d'administration.
  await expect(page.getByTestId("sidebar-admin")).toHaveCount(0);
  const admin = await page.goto("/admin");
  expect(admin?.status()).toBe(404);
  await expect(banner).toBeVisible();

  // Écriture par une route : 403 du middleware, toast « Lecture seule ».
  await page.goto("/equipe/profil");
  await expect(banner).toHaveAttribute("data-ready", "");
  const route = await page.evaluate(async () => {
    const r = await fetch("/api/referentiels/documents", { method: "POST", body: new FormData() });
    return { status: r.status, header: r.headers.get("x-csm-readonly") };
  });
  expect(route).toEqual({ status: 403, header: "write" });
  await expect(page.getByText(/Lecture seule : tu vois CSM en tant que/).first()).toBeVisible();

  // Export nominatif : refusé même en lecture.
  const exp = await page.request.get("/api/pmr/export");
  expect(exp.status()).toBe(403);

  // Écriture par une Server Action (statut du jour) : refusée par le client PocketBase de la cible.
  const group = page.getByRole("group", { name: "Statut du jour" });
  const before = await group.locator("[aria-pressed=true]").count();
  await group.getByRole("button", { name: "En formation" }).click();
  await expect(page.getByText(/Lecture seule/).first()).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("group", { name: "Statut du jour" }).locator("[aria-pressed=true]"),
  ).toHaveCount(before);

  // Retour : fiche du compte, plus de bandeau ; début et fin au journal d'audit.
  await page.getByTestId("acting-stop").click();
  await expect(page).toHaveURL(new RegExp(`/admin/utilisateurs/${id}$`));
  await expect(page.getByTestId("acting-banner")).toHaveCount(0);
  await page.goto(`/admin/audit?record=${id}`);
  await expect(page.getByTestId("audit-list")).toContainText("Début « en tant que »");
  await expect(page.getByTestId("audit-list")).toContainText("Fin « en tant que »");
  expect(errors).toEqual([]);
});
