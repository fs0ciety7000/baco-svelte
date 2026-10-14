import { lineLabel } from "@/lib/lines";
import { lineId } from "@/lib/orders/stops";

// Lignes desservies par une société de bus (Commandes › Fournisseurs, 15 oct. 2026) : choisies dans le référentiel
// `rail_lines` (« L.96 — Bruxelles-Midi – Quévy ») au lieu d'une saisie libre. Les valeurs reprises de BACO hors
// référentiel restent lisibles (et retirables), jamais réécrites. Logique pure, testée.

export type LineOption = { value: string; label: string; hint?: string };
export type StoredLine = { id: string; line: string };

/** Option d'une ligne du référentiel : valeur = libellé canonique « L.96 », libellé = numéro + extrémités. */
export function railLineOption(l: { line: string; name?: string }): LineOption {
  const value = lineLabel(l.line);
  const name = (l.name ?? "").trim();
  return { value, label: name ? `${value} — ${name}` : value };
}

const byNumber = (a: LineOption, b: LineOption) =>
  a.value.localeCompare(b.value, "fr", { numeric: true });

/**
 * Options du choix multiple et valeurs cochées : lignes du référentiel, plus les lignes enregistrées qu'il ne connaît
 * pas (« hors référentiel », gardées telles quelles). Une ligne enregistrée « 96 » ou « L 96 » coche « L.96 ».
 */
export function companyLineChoices(
  referential: LineOption[],
  stored: StoredLine[],
): { options: LineOption[]; selected: string[] } {
  const known = new Map(referential.map((o) => [lineId(o.value), o]));
  const legacy: LineOption[] = [];
  const selected: string[] = [];
  for (const s of stored) {
    const ref = known.get(lineId(s.line));
    if (ref) {
      if (!selected.includes(ref.value)) selected.push(ref.value);
      continue;
    }
    const raw = s.line.trim();
    if (!raw || selected.includes(raw)) continue;
    legacy.push({ value: raw, label: raw, hint: "hors référentiel" });
    selected.push(raw);
  }
  return { options: [...[...referential].sort(byNumber), ...legacy], selected };
}

/**
 * Écart entre les lignes enregistrées et le choix : `add` = valeurs à créer (libellé canonique), `remove` = fiches à
 * supprimer. Comparaison par numéro (« L.96 » = « 96 ») ; un doublon déjà enregistré part avec la ligne retirée.
 */
export function diffCompanyLines(
  stored: StoredLine[],
  wanted: string[],
): { add: string[]; remove: string[] } {
  const want = new Map<string, string>();
  for (const w of wanted) {
    const k = lineId(w);
    if (k && !want.has(k)) want.set(k, w.trim());
  }
  const have = new Set(stored.map((s) => lineId(s.line)));
  return {
    add: [...want.entries()].filter(([k]) => !have.has(k)).map(([, v]) => v),
    remove: stored.filter((s) => !want.has(lineId(s.line))).map((s) => s.id),
  };
}
