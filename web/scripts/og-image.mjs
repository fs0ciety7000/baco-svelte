// Génère l'image de partage (Open Graph / Twitter) de la page de connexion : public/brand/og-csm.png, 1200 × 630.
// Rejouable : `node scripts/og-image.mjs` depuis web/ (Playwright du projet, Chromium de /opt/pw-browsers).
// Sources : icône PWA (public/icons/icon-512.png), emblèmes de l'éditeur (public/brand/*.svg), couleurs du thème
// par défaut (src/design/tokens.ts). Aucun texte interne : nom de l'outil, mention « accès réservé », éditeur.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public/brand/og-csm.png");

const icon = (await readFile(path.join(root, "public/icons/icon-512.png"))).toString("base64");
const dragon = await readFile(path.join(root, "public/brand/occ-interactive.svg"), "utf8");
const wheel = await readFile(path.join(root, "public/brand/cardor-monogram.svg"), "utf8");

// Thème par défaut (tokens.ts) : bg, fg, fg-muted, fg-subtle, accent.
const c = { bg: "#0D0B09", fg: "#EDE7DC", muted: "#B1AA9E", subtle: "#8C857C", accent: "#FAC13B" };

const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; background: ${c.bg}; color: ${c.fg};
    font-family: "Inter", "DejaVu Sans", sans-serif; overflow: hidden; }
  .frame { position: absolute; inset: 0; padding: 72px 80px;
    background-image: linear-gradient(${c.fg}0a 1px, transparent 1px), linear-gradient(90deg, ${c.fg}0a 1px, transparent 1px);
    background-size: 40px 40px; display: flex; align-items: center; gap: 72px; }
  .icon { width: 360px; height: 360px; flex: none; }
  .text { display: flex; flex-direction: column; gap: 22px; min-width: 0; }
  .eyebrow { font-family: "DejaVu Sans Mono", monospace; font-size: 24px; letter-spacing: .14em;
    text-transform: uppercase; color: ${c.muted}; display: flex; align-items: center; gap: 14px; }
  .eyebrow i { width: 16px; height: 16px; background: ${c.accent}; display: inline-block; }
  h1 { font-size: 168px; line-height: .9; font-weight: 800; letter-spacing: -.02em; }
  .rule { width: 120px; height: 6px; background: ${c.accent}; }
  .sub { font-size: 36px; color: ${c.fg}; font-weight: 500; }
  .note { font-size: 26px; color: ${c.muted}; }
  .credit { position: absolute; right: 80px; bottom: 48px; display: flex; align-items: center; gap: 14px;
    font-size: 22px; color: ${c.subtle}; --logo-t1: ${c.muted}; --logo-t2: ${c.subtle}; --logo-t3: ${c.muted}; }
  .credit svg { height: 40px; width: auto; }
  .credit .wheel svg { height: 26px; }
  .credit b { color: ${c.muted}; font-weight: 600; }
</style></head><body><div class="frame">
  <img class="icon" alt="" src="data:image/png;base64,${icon}">
  <div class="text">
    <p class="eyebrow"><i></i>Client Solutions</p>
    <h1>CSM</h1>
    <span class="rule"></span>
    <p class="sub">Client Solutions Management Tool</p>
    <p class="note">Outil interne · accès réservé aux agents autorisés</p>
  </div>
  <div class="credit">${dragon}<span><b>CM Interactive</b> · une division de</span>
    <span class="wheel">${wheel}</span><b>CARDOR Media</b></div>
</div></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: out, type: "png" });
  console.log(`OK ${path.relative(root, out)} (1200 × 630)`);
} finally {
  await browser.close();
}
