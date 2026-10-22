import { expect, test, type Page } from "@playwright/test";

import { identity, login, noHorizontalScroll, password } from "./helpers";

// Missions PMR / Groupes (15 oct. 2026) : tableau sans coupure (défilement horizontal dans le cadre, train et « Copier »
// collants, aucun défilement de page) et repère « maintenant » (ligne insérée entre la dernière mission passée et la
// prochaine, passées estompées, prochaine signalée, mini-frise, « Aller à maintenant »). Horloge du navigateur fixée à
// 13:40 (Bruxelles) ; missions fictives du jour (gares « XN… »), supprimées à la fin.

const PB = (process.env.PB_URL ?? "http://127.0.0.1:8090").replace(/\/$/, "");
const suEmail = process.env.PB_SUPERUSER_EMAIL ?? "";
const suPassword = process.env.PB_SUPERUSER_PASSWORD ?? "";
test.skip(!identity || !password || !suEmail, "E2E_IDENTITY / PB_SUPERUSER_* non définis");
test.describe.configure({ mode: "serial" });

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
const ST = `XN${suffix}`;
let root = "";
const created: [string, string][] = [];

async function pb(method: string, path: string, body?: unknown) {
  const res = await fetch(`${PB}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(root ? { authorization: root } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.status === 204 ? null : res.json();
}

/** Instant UTC correspondant à `hm` aujourd'hui à Bruxelles. */
function brussels(hm: string): Date {
  const probe = new Date(`${today}T12:00:00Z`);
  const off = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Brussels",
    timeZoneName: "longOffset",
  })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value; // « GMT+02:00 »
  const m = /([+-])(\d{2}):(\d{2})/.exec(off ?? "");
  const sign = m?.[1] === "-" ? "-" : "+";
  return new Date(`${today}T${hm}:00${m ? `${sign}${m[2]}:${m[3]}` : "Z"}`);
}

async function openAt(page: Page, path: string) {
  await page.clock.install({ time: brussels("13:40") });
  await login(page, path.split("?")[0]!);
  await page.goto(path);
}

test.beforeAll(async () => {
  root = (
    await pb("POST", "/api/collections/_superusers/auth-with-password", {
      identity: suEmail,
      password: suPassword,
    })
  ).token;
  const times = ["07:05", "09:20", "11:45", "13:10", "14:05", "16:30", "19:15"];
  for (const [i, t] of times.entries()) {
    const r = await pb("POST", "/api/collections/pmr_assists/records", {
      dicos_id: `e2e-now-${suffix}-${i}`,
      day: today,
      time: t,
      station: `${ST} Départ-Très-Long-Nom ${i}`,
      other_station: `${ST} Arrivée-Très-Long-Nom ${i}`,
      arr_time: `${String(Number(t.slice(0, 2)) + 1).padStart(2, "0")}:${t.slice(3)}`,
      in_assist: true,
      out_assist: i === 3,
      direction: "depart",
      train: String(99700 + i),
      pax: 1,
      pmr_type: "CRF",
      status: "prevue",
      transport: "train",
    });
    if (r?.id) created.push(["pmr_assists", r.id]);
  }
  for (const [i, t] of ["08:10", "15:40"].entries()) {
    const g = await pb("POST", "/api/collections/group_missions/records", {
      dicos_id: `e2e-now-g-${suffix}-${i}`,
      day: today,
      time: t,
      station: `${ST} Groupe ${i}`,
      other_station: `${ST} Arrivée ${i}`,
      arr_time: "",
      in_assist: true,
      out_assist: false,
      transport: "train",
      train: String(99800 + i),
      group_name: `École E2E ${i}`,
      adults: 2,
      children: 20,
      seniors: 0,
      status: "prevue",
    });
    if (g?.id) created.push(["group_missions", g.id]);
  }
});

test.afterAll(async () => {
  for (const [col, id] of created.reverse())
    await pb("DELETE", `/api/collections/${col}/records/${id}`);
});

test("missions PMR : repère « maintenant », passées estompées, prochaine, mini-frise", async ({
  page,
}, info) => {
  const desktop = info.project.name === "desktop";
  await openAt(page, `/pmr?district=tous&q=${ST}`);
  const scope = page.getByTestId(desktop ? "assists-table" : "assists-cards");
  const now = scope.getByTestId("now-line");
  await expect(now).toBeVisible();
  await expect(now.getByTestId("now-time")).toHaveText("Maintenant · 13:40");
  await expect(now).toContainText("dans 25 min");
  // Ordre : 4 missions avant le repère (07:05 → 13:10), la prochaine (14:05) juste après.
  const items = scope.locator(desktop ? ":scope > tr" : ":scope > li");
  const kinds = await items.evaluateAll((els) =>
    els.map((e) =>
      e.getAttribute("data-testid") === "now-line"
        ? "now"
        : e.hasAttribute("data-next")
          ? "next"
          : e.hasAttribute("data-past")
            ? "past"
            : "row",
    ),
  );
  // 13:10 a un débarquement à 14:10 : pas estompée.
  expect(kinds).toEqual(["past", "past", "past", "row", "now", "next", "row", "row"]);
  await expect(scope.getByTestId("next-badge")).toHaveCount(1);
  // Trajet de 13:10 (départ passé) : gare de départ estompée seule, débarquement de 14:10 rappelé sous le repère.
  await expect(scope.locator("[data-faded]")).toHaveCount(1);
  const pendingRow = now.getByTestId("now-pending");
  await expect(pendingRow).toContainText("99703");
  await expect(pendingRow).toContainText("14:10");
  await expect(pendingRow).toContainText(`${ST} Arrivée-Très-Long-Nom 3`);
  // Mini-frise : curseur sur la journée, « Aller à maintenant » ramène le repère à l'écran.
  const strip = page.getByTestId("day-strip");
  await expect(strip.getByTestId("strip-cursor")).toBeVisible();
  await expect(strip.getByTestId("strip-done")).toHaveText("3/7");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await strip.getByTestId("go-now").click();
  await expect(now).toBeInViewport();
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/pmr-maintenant-${info.project.name}.png` });
});

test("missions PMR : un débarquement plus proche que le prochain départ devient « Prochaine » sur la gare d'arrivée", async ({
  page,
}, info) => {
  const desktop = info.project.name === "desktop";
  // 14:07 : le départ de 14:05 est passé, le prochain départ est à 16:30 ; le débarquement de 14:10 (trajet de 13:10) passe avant.
  await page.clock.install({ time: brussels("14:07") });
  await login(page, "/pmr");
  await page.goto(`/pmr?district=tous&q=${ST}`);
  const scope = page.getByTestId(desktop ? "assists-table" : "assists-cards");
  await expect(scope.getByTestId("now-line")).toContainText("dans 3 min");
  const badge = scope.getByTestId("next-badge");
  await expect(badge).toHaveCount(1);
  // Desktop : pastille à côté de la gare d'arrivée du trajet de 13:10 ; mobile : pastille dans l'en-tête de la carte et
  // heure d'arrivée (14:10) mise en avant.
  if (desktop)
    await expect(badge.locator("xpath=..")).toContainText(`${ST} Arrivée-Très-Long-Nom 3`);
  else await expect(scope.locator("[data-next-time]")).toHaveText("14:10");
  await expect(scope.locator("[data-next]")).toContainText("99703");
  await noHorizontalScroll(page);
  await badge.scrollIntoViewIfNeeded();
  if (process.env.E2E_SHOTS_DIR)
    await page.screenshot({
      path: `${process.env.E2E_SHOTS_DIR}/pmr-prochaine-out-${info.project.name}.png`,
    });
});

test("missions PMR : tableau sans coupure, panneau ancré compris (1280 px)", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "tableau desktop");
  await page.setViewportSize({ width: 1280, height: 800 });
  await openAt(page, `/pmr?district=tous&q=${ST}`);
  await page.getByRole("button", { name: /Ouvrir la mission de 07:05/ }).click();
  await expect(page.getByTestId("assist-panel")).toBeVisible();
  await noHorizontalScroll(page);
  const region = page.getByRole("region", { name: /Missions PMR du/ });
  const m = await region.evaluate((el) => ({
    overflow: el.scrollWidth > el.clientWidth,
    box: el.getBoundingClientRect().toJSON() as DOMRect,
  }));
  // Le tableau défile dans son cadre (pas la page) s'il le faut ; « Copier » reste visible (colonne collante). v4 lot 4 :
  // moins de colonnes (sens dans la cellule de gare), le tableau peut tenir sans défiler.
  const copy = page
    .getByTestId("assists-table")
    .getByRole("button", { name: /Copier/ })
    .first();
  const cb = await copy.boundingBox();
  expect(cb).not.toBeNull();
  expect(cb!.x + cb!.width).toBeLessThanOrEqual(m.box.right + 1);
  if (m.overflow) {
    // Défilement horizontal : le train reste collé à gauche.
    const train = page.getByTestId("assists-table").locator("tr[data-hl] > td").first();
    const before = (await train.boundingBox())!.x;
    await region.evaluate((el) => (el.scrollLeft = 400));
    await expect
      .poll(async () => Math.round((await train.boundingBox())!.x))
      .toBe(Math.round(before));
  }
  await page.screenshot({ path: "test-results/pmr-tableau-1280-panneau.png" });
});

test("groupes : repère « maintenant » et mini-frise", async ({ page }, info) => {
  const desktop = info.project.name === "desktop";
  await openAt(page, `/groupes?district=tous&q=${ST}`);
  await expect(page.getByTestId("day-strip")).toBeVisible();
  const scope = page.locator(desktop ? "[data-testid=groups-table]" : "ul[data-hl-scope=groups]");
  await expect(scope.getByTestId("now-line")).toBeVisible();
  await expect(scope.locator("[data-next]")).toHaveCount(1);
  await noHorizontalScroll(page);
});
