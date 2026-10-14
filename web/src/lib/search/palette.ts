// Recherche granulaire de la palette ⌘K (14 oct. 2026, demande « recherche dans tous les modules »). Logique pure,
// partagée par le serveur (`app/search-actions.ts`) et testée : lecture de la saisie (n° de train, relation, ligne,
// abréviation de gare), ordre des groupes selon ce que la saisie ressemble le plus, rangement des gares.

import { foldStation } from "@/lib/stations/search";

/** Ce que la saisie peut désigner (plusieurs lectures à la fois : « L36 » = ligne 36 ET relation L36). */
export type PaletteQuery = {
  /** Saisie nettoyée (espaces simples, 60 caractères au plus). */
  q: string;
  /** N° de train plausible (2 à 5 chiffres). */
  trainNumber: number | null;
  /** N° de bon / de taxi (1 à 6 chiffres). */
  orderNumber: number | null;
  /** Ligne d'infrastructure normalisée (« 96 », « 124A »). */
  line: string | null;
  /** Vrai si la saisie est explicitement une ligne (« L.96 », « L 96 ») : pas d'autre lecture. */
  lineOnly: boolean;
  /** Relation SNCB normalisée (« IC14 », « IC04 », « S1 », « L36 »). */
  relation: string | null;
  /** Abréviation PtCar plausible (« FMS »), en majuscules. */
  abbr: string | null;
  /** La saisie contient des lettres : recherche dans les noms, titres, adresses. */
  text: boolean;
};

const pad2 = (d: string) => String(Number(d)).padStart(2, "0");

/** Lit la saisie de la palette ; null si elle est trop courte (moins de 2 caractères). */
export function parsePaletteQuery(input: string): PaletteQuery | null {
  const q = String(input ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  if (q.length < 2) return null;
  const digits = /^\d+$/.test(q);
  const n = digits ? Number(q) : 0;
  const out: PaletteQuery = {
    q,
    trainNumber: digits && q.length >= 2 && q.length <= 5 && n > 0 ? n : null,
    orderNumber: digits && q.length <= 6 && n > 0 ? n : null,
    line: null,
    lineOnly: false,
    relation: null,
    abbr: null,
    text: /\p{L}/u.test(q),
  };

  // « L.96 », « L 96 », « l-124a » : ligne seulement.
  const explicit = /^L\s*[.\- ]\s*(\d{1,3}[A-Z]?)$/i.exec(q);
  if (explicit) {
    out.line = explicit[1]!.toUpperCase();
    out.lineOnly = true;
    out.text = false;
    return out;
  }
  // « L96 » : ligne 96, et relation L96 si elle existe (« L36 » est aussi une relation omnibus).
  const glued = /^L(\d{1,3})([A-Z]?)$/i.exec(q);
  if (glued) {
    out.line = `${Number(glued[1])}${glued[2]!.toUpperCase()}`;
    if (!glued[2] && glued[1]!.length <= 2) out.relation = `L${pad2(glued[1]!)}`;
    out.text = false;
    return out;
  }
  // « 96 », « 124A » : ligne (et n° de train / de bon pour les chiffres seuls).
  if (/^\d{1,3}[A-Z]?$/i.test(q)) out.line = q.toUpperCase().replace(/^0+(?=\d)/, "");
  // « IC14 », « ic 4 », « S1 », « s-10 » : relation.
  const rel = /^(IC|S)\s*-?\s*(\d{1,2})$/i.exec(q);
  if (rel) {
    const type = rel[1]!.toUpperCase();
    out.relation = type === "IC" ? `IC${pad2(rel[2]!)}` : `S${Number(rel[2])}`;
    out.text = false;
    return out;
  }
  if (/^[A-Z]{2,5}$/i.test(q)) out.abbr = q.toUpperCase();
  return out;
}

/** Groupes de résultats de la palette, avec leur module (en-tête « Module › Type »). */
export const PALETTE_GROUPS = {
  live: { module: "Réseau", label: "Trains en direct" },
  bus: { module: "Commandes", label: "Bons bus" },
  taxi: { module: "Commandes", label: "Bons taxi" },
  suppliers: { module: "Commandes", label: "Fournisseurs" },
  archives: { module: "Commandes", label: "Archives" },
  pmr: { module: "PMR", label: "Missions PMR" },
  groups: { module: "PMR", label: "Groupes" },
  journal: { module: "Opérations", label: "Journal" },
  journee: { module: "Opérations", label: "Ma journée" },
  pn: { module: "Réseau", label: "Passages à niveau" },
  stations: { module: "Réseau", label: "Gares" },
  lines: { module: "Réseau", label: "Lignes" },
  relations: { module: "Réseau", label: "Relations" },
  trains: { module: "Réseau", label: "Horaires" },
  ptcar: { module: "Réseau", label: "PtCar" },
  contacts: { module: "Ressources", label: "Contacts" },
  procedures: { module: "Ressources", label: "Procédures" },
  documents: { module: "Ressources", label: "Documents" },
  ebp: { module: "Réseau", label: "EBP" },
  team: { module: "Ressources", label: "Collègues" },
  users: { module: "Administration", label: "Comptes" },
} as const;

export type PaletteGroupId = keyof typeof PALETTE_GROUPS;

/** Ordre par défaut : modules dans l'ordre de la navigation. */
const DEFAULT_ORDER: PaletteGroupId[] = [
  "journal",
  "journee",
  "bus",
  "taxi",
  "suppliers",
  "archives",
  "pmr",
  "groups",
  "live",
  "trains",
  "relations",
  "lines",
  "stations",
  "ptcar",
  "ebp",
  "pn",
  "contacts",
  "team",
  "procedures",
  "documents",
  "users",
];

/**
 * Ordre d'affichage des groupes : ce que la saisie désigne le plus probablement d'abord (relation, ligne, n° de
 * train, abréviation de gare), puis l'ordre des modules.
 */
export function paletteGroupOrder(p: PaletteQuery): PaletteGroupId[] {
  const first: PaletteGroupId[] = [];
  if (p.relation) first.push("relations");
  if (p.lineOnly || (p.line && !p.trainNumber && !p.relation)) first.push("lines");
  if (p.trainNumber) first.push("live", "trains", "bus", "taxi", "pmr", "groups", "pn");
  if (p.line && !first.includes("lines")) first.push("lines");
  if (p.abbr) first.push("stations", "ptcar");
  const seen = new Set<PaletteGroupId>();
  return [...first, ...DEFAULT_ORDER].filter((g) => !seen.has(g) && !!seen.add(g));
}

/** En-tête affiché d'un groupe. */
export function paletteHeading(id: PaletteGroupId): string {
  const g = PALETTE_GROUPS[id];
  return `${g.module} › ${g.label}`;
}

/** Trie des résultats selon l'ordre des groupes ; les groupes vides disparaissent. */
export function orderPaletteGroups<T extends { id: PaletteGroupId; items: unknown[] }>(
  p: PaletteQuery,
  groups: T[],
): T[] {
  const order = paletteGroupOrder(p);
  return groups
    .filter((g) => g.items.length > 0)
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

/** Gare candidate (référentiel `stations`). */
export type StationCandidate = { abbr: string; name: string; nameNl: string; aliases: string[] };

/**
 * Rang d'une gare pour la saisie : 0 abréviation exacte, 1 nom (FR, NL, alias) qui commence par la saisie,
 * 2 mot du nom qui commence par la saisie, 3 nom qui la contient, -1 aucune correspondance.
 */
export function stationRank(s: StationCandidate, q: string): number {
  const fq = foldStation(q);
  if (!fq) return -1;
  if (s.abbr && s.abbr.toUpperCase() === q.trim().toUpperCase()) return 0;
  const names = [s.name, s.nameNl, ...s.aliases].map(foldStation).filter(Boolean);
  if (names.some((n) => n.startsWith(fq))) return 1;
  if (names.some((n) => n.split(" ").some((w) => w.startsWith(fq)))) return 2;
  if (names.some((n) => n.includes(fq))) return 3;
  return -1;
}

/** Gares rangées (rang puis nom), sans les non-correspondances, `max` au plus. */
export function rankStations<T extends StationCandidate>(rows: T[], q: string, max = 5): T[] {
  return rows
    .map((s) => ({ s, r: stationRank(s, q) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.s.name.localeCompare(b.s.name, "fr"))
    .slice(0, max)
    .map((x) => x.s);
}

/** Un seul résultat par n° de train (les variantes de jours d'un même train sont regroupées). */
export function uniqueBy<T>(rows: T[], key: (r: T) => string | number, max = 5): T[] {
  const seen = new Set<string | number>();
  const out: T[] = [];
  for (const r of rows) {
    const k = key(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
}
