import { expect, test } from "@playwright/test";

import { identity, login, noHorizontalScroll, password } from "./helpers";

// Export ALEA : choix du jour dans la fenêtre et « Synchroniser ce jour » par l'extension (22 oct. 2026). L'extension
// est simulée dans la page (réponses `hello` / `sync-result` du script `csm-link.js` 1.10.0) ; à la synchro, le test
// crée une mission de plus (comme l'extension l'aurait envoyée) et vérifie que la fenêtre relit le jour. Missions
// fictives de demain (gares « XA… », trains 996xx), supprimées à la fin.

const PB = (process.env.PB_URL ?? "http://127.0.0.1:8090").replace(/\/$/, "");
const suEmail = process.env.PB_SUPERUSER_EMAIL ?? "";
const suPassword = process.env.PB_SUPERUSER_PASSWORD ?? "";
test.skip(!identity || !password || !suEmail, "E2E_IDENTITY / PB_SUPERUSER_* non définis");
test.describe.configure({ mode: "serial" });

const fmt = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(d);
const today = fmt(new Date());
const tomorrow = (() => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
})();
const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
let root = "";
const created: string[] = [];

async function pb(method: string, path: string, body?: unknown) {
  const res = await fetch(`${PB}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(root ? { authorization: root } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.status === 204 ? null : res.json();
}

async function assist(project: string, n: number) {
  const r = await pb("POST", "/api/collections/pmr_assists/records", {
    dicos_id: `e2e-alea-${suffix}-${project}-${n}-${Math.random().toString(36).slice(2, 6)}`,
    day: tomorrow,
    time: `0${7 + n}:15`,
    station: `XA${suffix} ${project} Départ ${n}`,
    other_station: `XA${suffix} ${project} Arrivée ${n}`,
    arr_time: `0${8 + n}:15`,
    in_assist: true,
    out_assist: false,
    direction: "depart",
    train: String((project === "desktop" ? 99600 : 99650) + n),
    pax: 1,
    pmr_type: "CRF",
    status: "prevue",
    transport: "train",
  });
  if (!r?.id) throw new Error(`fixture : ${JSON.stringify(r).slice(0, 300)}`);
  created.push(r.id);
}

test.beforeAll(async () => {
  root = (
    await pb("POST", "/api/collections/_superusers/auth-with-password", {
      identity: suEmail,
      password: suPassword,
    })
  ).token;
});

test.afterAll(async () => {
  for (const id of created) await pb("DELETE", `/api/collections/pmr_assists/records/${id}`);
});

test("ALEA : autre jour, puis synchro du jour par l'extension", async ({ page }, info) => {
  const project = info.project.name;
  // Données propres au format (desktop et mobile tournent en parallèle, chacun avec son beforeAll).
  await assist(project, 0);
  await page.exposeFunction("__e2eDicosSync", async () => {
    await assist(project, 1);
    return 2;
  });
  // Extension 1.10.0 simulée : répond au ping et à « sync ».
  await page.addInitScript(() => {
    window.addEventListener("message", async (e: MessageEvent) => {
      const d = e.data as { source?: string; type?: string; id?: string; day?: string };
      if (e.source !== window || !d || d.source !== "csm-page") return;
      const post = (m: object) =>
        window.postMessage({ source: "csm-dicos-connector", ...m }, window.location.origin);
      if (d.type === "ping") post({ type: "hello", version: "1.10.0", configured: true, sync: true });
      if (d.type === "sync") {
        const n = await (window as unknown as { __e2eDicosSync: () => Promise<number> }).__e2eDicosSync();
        post({ type: "sync-result", id: d.id, day: d.day, ok: true, missions: n, groups: 0 });
      }
    });
  });
  await login(page, "/pmr");
  await page.goto(`/pmr?du=${today}&au=${today}&district=tous`);
  await page.getByRole("button", { name: "Export ALEA", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("alea-day-bar")).toBeVisible();
  await dialog.getByRole("button", { name: "Jour suivant" }).click();
  const base = project === "desktop" ? 99600 : 99650;
  const blocks = dialog.getByTestId("alea-block");
  await expect(blocks.filter({ hasText: String(base) })).toHaveCount(1);
  await expect(blocks.filter({ hasText: String(base + 1) })).toHaveCount(0);
  await expect(dialog.getByTestId("alea-sync-day")).toBeEnabled();
  await dialog.getByTestId("alea-sync-day").click();
  await expect(blocks.filter({ hasText: String(base + 1) })).toHaveCount(1);
  await expect(page.getByText(/synchronisé : 2 trajets PMR/)).toBeVisible();
  await noHorizontalScroll(page);
  if (process.env.E2E_SHOTS_DIR)
    await page.screenshot({ path: `${process.env.E2E_SHOTS_DIR}/alea-jour-${project}.png` });
});

test("ALEA : extension absente, bouton désactivé et lien vers l'extension", async ({ page }) => {
  await login(page, "/pmr");
  await page.goto(`/pmr?du=${today}&au=${today}&district=tous`);
  await page.getByRole("button", { name: "Export ALEA", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Extension DICOS non détectée sur cette page.")).toBeVisible();
  await expect(dialog.getByTestId("alea-sync-day")).toBeDisabled();
  await expect(dialog.getByRole("link", { name: "Extension CSM" })).toBeVisible();
});
