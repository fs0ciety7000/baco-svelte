// Fiche de version lue par CSM (page PMR › Extension DICOS) : paquets de la version courante présents dans le dossier
// de sortie — zips Chrome / Firefox construits par build-zips.sh et, s'il existe, le .xpi Firefox SIGNÉ par
// addons.mozilla.org (job CI « Signer l'extension Firefox »). Usage : node release-json.mjs <dossier> <version>
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [dir, version] = process.argv.slice(2);
if (!dir || !/^\d+\.\d+\.\d+$/.test(version || "")) throw new Error("usage: release-json.mjs <dossier> <version>");
const kinds = [
  [`csm-dicos-connector-chrome-v${version}.zip`, "chrome"],
  [`csm-dicos-connector-firefox-v${version}.zip`, "firefox"],
  [`csm-dicos-connector-firefox-v${version}.xpi`, "firefox-signed"],
];
const present = new Set(readdirSync(dir));
const files = kinds
  .filter(([name]) => present.has(name))
  .map(([name, browser]) => {
    const buf = readFileSync(path.join(dir, name));
    return { name, browser, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
  });
writeFileSync(
  path.join(dir, "release.json"),
  JSON.stringify({ version, builtAt: new Date().toISOString(), files }, null, 2) + "\n",
);
console.log(`release.json : v${version}, ${files.map((f) => f.browser).join(", ")}`);
