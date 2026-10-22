import { expect, test } from "@playwright/test";

import { identity, login, password } from "./helpers";

// Régression du 22 oct. 2026 : sur Missions PMR, les textes réservés aux lecteurs d'écran (`sr-only`, en position absolue)
// des badges IN / OUT « validé » sortaient du tableau à défilement interne (`ScrollTable`, conteneur non positionné) et
// allongeaient la page de plusieurs écrans : la barre latérale collante remontait avec le pied de page. La page ne doit
// jamais dépasser le shell. Missions fictives du jour (gares « XL… », trains 994xx), supprimées à la fin.

const PB = (process.env.PB_URL ?? "http://127.0.0.1:8090").replace(/\/$/, "");
const suEmail = process.env.PB_SUPERUSER_EMAIL ?? "";
const suPassword = process.env.PB_SUPERUSER_PASSWORD ?? "";
test.skip(!identity || !password || !suEmail, "E2E_IDENTITY / PB_SUPERUSER_* non définis");

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
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

test("Missions PMR : longue liste, la page ne dépasse pas le shell", async ({ page }, info) => {
  const tag = `${info.project.name}-${Math.random().toString(36).slice(2, 6)}`;
  for (let i = 0; i < 40; i++) {
    const r = await pb("POST", "/api/collections/pmr_assists/records", {
      dicos_id: `e2e-layout-${tag}-${i}`,
      day: today,
      time: `${String(5 + Math.floor(i / 3)).padStart(2, "0")}:${String((i % 3) * 15).padStart(2, "0")}`,
      station: `XL ${tag} Départ ${i}`,
      other_station: `XL ${tag} Arrivée ${i}`,
      in_assist: true,
      out_assist: true,
      in_status: "realisee",
      out_status: "realisee",
      direction: "depart",
      train: String(99400 + i),
      pax: 1,
      pmr_type: "NV",
      status: "realisee",
      transport: "train",
    });
    if (!r?.id) throw new Error(`fixture : ${JSON.stringify(r).slice(0, 200)}`);
    created.push(r.id);
  }
  await login(page, "/pmr");
  await page.goto(
    `/pmr?du=${today}&au=${today}&district=tous&q=${encodeURIComponent(`XL ${tag}`)}`,
  );
  await expect(page.getByTestId("assists-table").locator("tr:not([data-band])")).toHaveCount(40);
  const sizes = await page.evaluate(() => {
    const shell = document.querySelector("div.flex.min-h-dvh") as HTMLElement;
    return {
      doc: document.documentElement.scrollHeight,
      shell: shell.getBoundingClientRect().height,
    };
  });
  expect(sizes.doc, "hauteur de page = hauteur du shell").toBeLessThanOrEqual(
    Math.ceil(sizes.shell) + 1,
  );
  if (info.project.name === "desktop") {
    await page.evaluate(() => window.scrollTo(0, 99999));
    const top = await page.evaluate(
      () =>
        (
          document.querySelector("nav[class*='sticky top-0']") as HTMLElement
        ).getBoundingClientRect().top,
    );
    expect(top, "barre latérale restée en haut").toBe(0);
  }
});
