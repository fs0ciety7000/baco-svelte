// Carte PN (refonte du 15 oct. 2026) : recherche, filtres, tri le long d'une ligne et regroupement des marqueurs à
// faible zoom. Pur et testé (`pn.test.ts`) ; partagé par la page (client) et la fiche d'une ligne (serveur).

export type PnLike = {
  id: string;
  line: string;
  number: string;
  bk: number;
  address: string;
  commune?: string;
  zone: string;
  infrabelId?: string;
  lat: number;
  lon: number;
};

/** Numéro d'un PN (format de `level_crossings.number`, migration 1760004800). */
export const PN_NUMBER_RE = /^[0-9]{1,4}( bis| ter|[A-Z]{1,8})?$/;

/** Saisie → numéro : « PN 12 bis » → « 12 bis », « 12a » → « 12A », « 007 » → « 7 » ; sinon rendu tel quel. */
export function pnNumber(raw: string): string {
  const m = /^(?:pn\s*)?([0-9]{1,4})\s*(bis|ter|[a-z]{1,8})?$/i.exec(raw.trim());
  if (!m) return raw.trim();
  const n = String(parseInt(m[1]!, 10));
  const s = (m[2] ?? "").toLowerCase();
  if (!s) return n;
  return s === "bis" || s === "ter" ? `${n} ${s}` : `${n}${s.toUpperCase()}`;
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Recherche libre : « 12 », « PN 12 L94 », « L.94 », « 12 L.94 », « L-94-12 » (n° Infrabel), ou des mots de l'adresse /
 * de la commune (« lessines », « rue de la station »).
 */
export function matchCrossing(c: PnLike, q: string): boolean {
  let t = fold(q).trim();
  if (!t) return true;
  const ramses = /^l-(\d{1,3}[a-z]?)-(\d{1,4}[a-z]*)$/.exec(t.replace(/\s+/g, ""));
  if (ramses) t = `l.${ramses[1]} ${ramses[2]}`;
  t = t.replace(/\bpn\b/g, " ").trim();
  const line = /\bl\.?\s*(\d{1,3}[a-z]?)\b/.exec(t);
  const rest = t.replace(/\bl\.?\s*\d{1,3}[a-z]?\b/, " ").trim();
  if (line && fold(c.line) !== `l.${line[1]}`) return false;
  if (!rest) return true;
  if (/^\d{1,4}\s?(bis|ter|[a-z]{1,2})?$/.test(rest))
    return fold(c.number).replace(/\s+/g, "") === rest.replace(/\s+/g, "");
  const hay = fold(`${c.address} ${c.commune ?? ""} ${c.line} ${c.number} ${c.zone}`);
  return rest.split(/\s+/).every((w) => hay.includes(w));
}

export type PnFilter = { q?: string; zones?: Set<string> | null; lines?: Set<string> | null };

export function filterCrossings<T extends PnLike>(list: T[], f: PnFilter): T[] {
  return list.filter(
    (c) =>
      (!f.zones || f.zones.has(c.zone)) &&
      (!f.lines || f.lines.has(c.line)) &&
      matchCrossing(c, f.q ?? ""),
  );
}

const lineNum = (l: string) => parseInt(l.replace(/^L\.?/i, ""), 10) || 0;
const numberNum = (n: string) => parseInt(n, 10) || 0;

/** Ligne (numérique), puis numéro (« 9 bis » après « 9 », « 12 » après « 9 »). */
export function compareByNumber(a: PnLike, b: PnLike): number {
  return (
    lineNum(a.line) - lineNum(b.line) ||
    a.line.localeCompare(b.line) ||
    numberNum(a.number) - numberNum(b.number) ||
    a.number.localeCompare(b.number)
  );
}

/** Le long d'une ligne : BK croissante (PN sans BK à la fin, par numéro). */
export function compareByBk(a: PnLike, b: PnLike): number {
  if (a.bk && b.bk && a.bk !== b.bk) return a.bk - b.bk;
  if (!!a.bk !== !!b.bk) return a.bk ? -1 : 1;
  return compareByNumber(a, b);
}

/** BK affichée : « 12.345 », « ≈ 12.3 » si elle est estimée, « — » sans BK. */
export function bkLabel(bk: number, estimated: boolean): string {
  if (!bk) return "—";
  return estimated ? `≈ ${bk.toFixed(1)}` : bk.toFixed(3);
}

// --- Regroupement ------------------------------------------------------------------------------------------------

/** Coordonnées « monde » Web Mercator au zoom donné (pixels, 256 × 2^zoom). */
export function worldPx(lat: number, lon: number, zoom: number): [number, number] {
  const scale = 256 * 2 ** zoom;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return [((lon + 180) / 360) * scale, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale];
}

export type Cluster<T> =
  | { kind: "point"; item: T }
  | { kind: "cluster"; lat: number; lon: number; count: number; items: T[] };

/**
 * Regroupe les points d'une même case de `cellPx` pixels (grille Web Mercator au zoom courant) ; à partir de `fromZoom`,
 * plus aucun regroupement. Un point seul dans sa case reste un point ; `keep` (point sélectionné) n'est jamais regroupé.
 */
export function clusterPoints<T extends { id: string; lat: number; lon: number }>(
  points: T[],
  zoom: number,
  { cellPx = 56, fromZoom = 13, keep }: { cellPx?: number; fromZoom?: number; keep?: string | null } = {},
): Cluster<T>[] {
  if (zoom >= fromZoom) return points.map((item) => ({ kind: "point", item }));
  const cells = new Map<string, T[]>();
  const out: Cluster<T>[] = [];
  for (const p of points) {
    if (p.id === keep) {
      out.push({ kind: "point", item: p });
      continue;
    }
    const [x, y] = worldPx(p.lat, p.lon, zoom);
    const k = `${Math.floor(x / cellPx)}:${Math.floor(y / cellPx)}`;
    const list = cells.get(k) ?? [];
    list.push(p);
    cells.set(k, list);
  }
  for (const items of cells.values()) {
    if (items.length === 1) out.push({ kind: "point", item: items[0]! });
    else
      out.push({
        kind: "cluster",
        lat: items.reduce((s, p) => s + p.lat, 0) / items.length,
        lon: items.reduce((s, p) => s + p.lon, 0) / items.length,
        count: items.length,
        items,
      });
  }
  return out;
}
