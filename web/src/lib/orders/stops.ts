// Lignes et arrêts intermédiaires d'un bon bus (déduits des gares de chaque ligne, ex-ligne_data).

export type LineInfo = { line: string; stations: string[] };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

function indexOf(stations: string[], name: string): number {
  const n = norm(name);
  return n ? stations.findIndex((s) => norm(s) === n) : -1;
}

/** Lignes qui desservent l'origine et la destination ; à défaut, celles qui desservent l'une des deux. */
export function suggestLines(lines: LineInfo[], origin: string, destination: string): string[] {
  const both = lines.filter(
    (l) => indexOf(l.stations, origin) !== -1 && indexOf(l.stations, destination) !== -1,
  );
  if (both.length) return both.map((l) => l.line);
  return lines
    .filter((l) => indexOf(l.stations, origin) !== -1 || indexOf(l.stations, destination) !== -1)
    .map((l) => l.line);
}

/** Gares strictement entre l'origine et la destination, sur les lignes choisies, dans l'ordre du trajet. */
export function stopsBetween(
  lines: LineInfo[],
  selected: string[],
  origin: string,
  destination: string,
): string[] {
  const out: string[] = [];
  for (const l of lines) {
    if (!selected.includes(l.line)) continue;
    const a = indexOf(l.stations, origin);
    const b = indexOf(l.stations, destination);
    if (a === -1 || b === -1 || a === b) continue;
    const slice = a < b ? l.stations.slice(a + 1, b) : l.stations.slice(b + 1, a).reverse();
    for (const s of slice) if (!out.some((x) => norm(x) === norm(s))) out.push(s);
  }
  return out;
}
