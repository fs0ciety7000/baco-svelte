#!/usr/bin/env node
// Référentiel des gares par défaut : node scripts/station-seed.mjs <export.json>
// <export.json> = réponse de /api/referentiels/gares/export?format=json d'une instance validée par l'équipe (préversion).
// Écrit src/data/station-seed.json : district de chaque gare (« » = aucun), type, lignes saisies à la main.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const file = process.argv[2];
if (!file) {
  console.error("usage : node scripts/station-seed.mjs <export.json>");
  process.exit(1);
}
const rows = JSON.parse(readFileSync(file, "utf8"));
if (!Array.isArray(rows) || rows.length < 100) {
  console.error(`export inattendu (${Array.isArray(rows) ? rows.length : typeof rows} lignes)`);
  process.exit(1);
}
const DISTRICTS = new Set(["", "DSO", "DSE", "DCE", "DNO", "DNE"]);
const KINDS = new Set(["gare", "pang", "etranger"]);
const out = {};
const count = {};
for (const r of rows.sort((a, b) => String(a.key).localeCompare(String(b.key)))) {
  if (!r.key || !DISTRICTS.has(r.district ?? "")) continue;
  const e = { d: r.district ?? "" };
  if (KINDS.has(r.kind)) e.k = r.kind;
  if (r.linesManual && Array.isArray(r.lines) && r.lines.length) e.l = r.lines.map(String);
  out[r.key] = e;
  count[e.d || "aucun"] = (count[e.d || "aucun"] ?? 0) + 1;
}
const target = fileURLToPath(new URL("../src/data/station-seed.json", import.meta.url));
writeFileSync(target, `${JSON.stringify(out, null, 0).replace(/\},"/g, '},\n"')}\n`);
console.log(`${Object.keys(out).length} gares →`, count);
