import { readFileSync } from "node:fs";
const T = JSON.parse(readFileSync(process.argv[2], "utf8"));
const lin = (v) => (v /= 255, v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255].map(lin); };
const L = (h) => { const [r, g, b] = rgb(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const cr = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const lab = (h) => { const [r, g, b] = rgb(h);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]; };
const dE = (a, b) => { const [x, y] = [lab(a), lab(b)]; return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
for (const [id, t] of Object.entries(T)) {
  const bad = [];
  const need = (n, a, b, min = 4.5) => { const r = cr(t[a], t[b]); if (r < min) bad.push(`${n} ${r.toFixed(2)}`); };
  for (const bgk of ["bg", "surface", "surface-2"]) { need(`fg/${bgk}`, "fg", bgk, 7); need(`muted/${bgk}`, "fg-muted", bgk, bgk === "surface-2" ? 4.5 : 5.5); for (const s of ["accent", "ok", "warn", "danger", "info", "progress"]) need(`${s}/${bgk}`, s, bgk); }
  need("subtle/bg", "fg-subtle", "bg", 3); need("accent-fg/accent", "accent-fg", "accent"); need("border-strong/bg", "border-strong", "bg", 3);
  const st = ["ok", "warn", "danger", "info", "progress"];
  const dist = st.map((s) => [s, dE(t.accent, t[s])]).sort((a, b) => a[1] - b[1]);
  let minPair = 9, mp = "";
  for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) { const d = dE(t[st[i]], t[st[j]]); if (d < minPair) { minPair = d; mp = st[i] + "/" + st[j]; } }
  if (dist[0][1] < 0.1) bad.push(`accent~${dist[0][0]} ${dist[0][1].toFixed(3)}`);
  if (minPair < 0.1) bad.push(`statuts ${mp} ${minPair.toFixed(3)}`);
  console.log(`${id.padEnd(12)} ${bad.length ? "✗ " + bad.join(", ") : "✓"}  (accent↔${dist[0][0]} ${dist[0][1].toFixed(3)}, statuts min ${mp} ${minPair.toFixed(3)}, muted/bg ${cr(t["fg-muted"], t.bg).toFixed(2)})`);
}
