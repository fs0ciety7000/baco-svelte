// Référentiel des relations de trains (demande du 14 oct. 2026) : ligne, type (IC, L, S, P…), relation (IC14, S1-1…),
// série de numéros, arrêts. Logique pure partagée par l'import (serveur) et les écrans.
//
// Sources : GTFS officiel de la SNCB (arrêts, passages sans arrêt, horaires, jours) + données ouvertes d'Infrabel
// (CC0 : relation exacte et n° de ligne d'infrastructure à chaque point), jointes sur le n° de train.

import { foldStation } from "@/lib/stations/search";

/**
 * Arrêt (ou passage sans arrêt, `p: 1`) d'un train : nom FR, nom NL s'il diffère (`t`), arrivée / départ « HH:MM »,
 * ligne d'infrastructure.
 */
export type ServiceStop = { n: string; t?: string; a?: string; d?: string; p?: 1; l?: string };

/** Un train (n° + suite d'arrêts) et ses jours de circulation dans la semaine de référence. */
export type TrainService = {
  /** n° + empreinte de la suite d'arrêts (un même n° peut avoir deux variantes selon le jour). */
  key: string;
  number: number;
  type: string;
  relation: string;
  /** « infrabel » (relation lue pour ce train), « serie » (déduite du demi-bloc), « gtfs » (type seul). */
  relationSource: "infrabel" | "serie" | "gtfs";
  /** Demi-bloc de 50 numéros (« 1700-1749 ») : les blocs de 100 mélangent deux relations (17xx = IC14 + S1). */
  series: string;
  origin: string;
  terminus: string;
  /** Lundi = 1, mardi = 2, mercredi = 4… dimanche = 64. */
  days: number;
  stops: ServiceStop[];
  lines: string[];
  /** « infrabel » (lignes lues pour ce train) ou « deduite » (gares communes aux voisines). */
  linesSource: "infrabel" | "deduite" | "";
  firstDep: string;
  lastArr: string;
};

/** Résumé d'une relation : variantes, séries, lignes, gares desservies. */
export type TrainRelation = {
  key: string;
  relation: string;
  type: string;
  label: string;
  variants: { from: string; to: string; trains: number; days: number }[];
  series: string[];
  lines: string[];
  numbers: number[];
  /** Arrêts de la variante la plus fréquente (avec la ligne à chaque arrêt). */
  pattern: ServiceStop[];
  trains: number;
  days: number;
};

export const DAY_BITS = [1, 2, 4, 8, 16, 32, 64] as const;
export const WEEKDAYS = 1 | 2 | 4 | 8 | 16;
export const SATURDAY = 32;
export const SUNDAY = 64;

/** « IC 14 » → « IC14 », « IC 06-2 » → « IC06-2 », « L 31 » → « L31 » ; « S1-1 », « P », « INT » inchangés. */
export function relationName(raw: string): string {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!s) return "";
  const m = /^(IC|L|S)\s*(\d+)(-\d+)?$/.exec(s);
  if (m) return `${m[1]}${m[2]}${m[3] ?? ""}`;
  return s.replace(/\s+/g, " ");
}

/** Type d'un train : d'après la relation (IC14 → IC, S1-1 → S, L31 → L, P), sinon d'après le GTFS (EC, ICE, EXT…). */
export function trainType(relation: string, gtfsShort = ""): string {
  const r = relationName(relation);
  const m = /^(IC|L|S|P)(\d|$|-)/.exec(r);
  if (m) return m[1]!;
  const g = String(gtfsShort ?? "")
    .trim()
    .toUpperCase();
  if (/^S\d+/.test(g)) return "S";
  if (["IC", "L", "P"].includes(g)) return g;
  return g || r || "?";
}

/** N° de ligne Infrabel normalisé : « 0/3 » → « 0 », « 161/2 » → « 161 », « 50D(1) » → « 50D », « 36N » inchangé. */
export function lineNorm(raw: string): string {
  return String(raw ?? "")
    .replace(/\(.*?\)/g, "")
    .split("/")[0]!
    .trim()
    .toUpperCase();
}

/** Demi-bloc de 50 numéros : 1706 → « 1700-1749 », 912 → « 900-949 ». */
export function seriesOf(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  const lo = Math.floor(n / 50) * 50;
  return `${lo}-${lo + 49}`;
}

/** Libellé court d'un demi-bloc : « 1700-1749 » → « 17xx (00-49) ». */
export function seriesLabel(series: string): string {
  const m = /^(\d+)-(\d+)$/.exec(series);
  if (!m) return series;
  const lo = Number(m[1]);
  const hundred = Math.floor(lo / 100);
  const half = lo % 100 === 0 ? "00-49" : "50-99";
  return `${hundred > 0 ? hundred : ""}xx (${half})`;
}

/** Libellé des jours : « Lun-ven », « Sam », « Dim », « Tous les jours »… */
export function daysLabel(days: number): string {
  if (!days) return "—";
  if (days === 127) return "Tous les jours";
  if (days === WEEKDAYS) return "Lun-ven";
  if (days === (WEEKDAYS | SATURDAY)) return "Lun-sam";
  if (days === (SATURDAY | SUNDAY)) return "Week-end";
  const names = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  return names.filter((_, i) => days & DAY_BITS[i]!).join(", ");
}

/** Clé de recherche « |nom replié|… » (filtre PocketBase `~ "|mons|"`, sans faux positif « Mons » ≠ « Monsville »). */
export function keyOf(values: Iterable<string>): string {
  const set = new Set<string>();
  for (const v of values) {
    const f = foldStation(v);
    if (f) set.add(f);
  }
  return set.size ? `|${[...set].join("|")}|` : "";
}

/** Clé d'une ligne : « 96 » → « |96| ». */
export function lineKeyOf(lines: Iterable<string>): string {
  const set = new Set([...lines].map(lineNorm).filter(Boolean));
  return set.size ? `|${[...set].join("|")}|` : "";
}

/** Heure GTFS « 25:10:00 » → « 01:10 ». */
export function hhmm(t: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? "").trim());
  if (!m) return "";
  return `${String(Number(m[1]) % 24).padStart(2, "0")}:${m[2]}`;
}

/** Tri des relations : IC, L, S, P puis le reste ; numérotées (IC01…) avant les génériques (EXTRA, IC…) ; n° croissant. */
export function relationOrder(
  a: { type: string; relation: string },
  b: { type: string; relation: string },
) {
  const rank = (t: string) => {
    const i = ["IC", "L", "S", "P"].indexOf(t);
    return i < 0 ? 9 : i;
  };
  const generic = (r: string) => (/^(IC|L|S)\d/.test(r) ? 0 : 1);
  return (
    rank(a.type) - rank(b.type) ||
    generic(a.relation) - generic(b.relation) ||
    a.relation.localeCompare(b.relation, "fr", { numeric: true })
  );
}

/** Une relation précise (IC14, S1-1, L31) regroupe ses trains ; une relation générique (P, IC, INT…) par terminus. */
export function relationKey(s: { relation: string; origin: string; terminus: string }): string {
  if (/\d/.test(s.relation)) return s.relation;
  const ends = [foldStation(s.origin), foldStation(s.terminus)].sort().join("~");
  return `${s.relation}|${ends}`;
}

/** Vrai si l'arrêt porte l'un des noms repliés cherchés (nom FR ou NL). */
export function stopMatches(stop: ServiceStop, folded: Set<string>): boolean {
  return folded.has(foldStation(stop.n)) || (!!stop.t && folded.has(foldStation(stop.t)));
}

/** Filtre de jours d'un écran : semaine, samedi, dimanche ou tous. */
export const DAY_FILTERS = {
  semaine: { label: "Semaine", mask: WEEKDAYS },
  samedi: { label: "Samedi", mask: SATURDAY },
  dimanche: { label: "Dimanche", mask: SUNDAY },
  tous: { label: "Tous les jours", mask: 127 },
} as const;
export type DayFilter = keyof typeof DAY_FILTERS;

/** Filtre de jours par défaut : le type du jour (Bruxelles) ; `day` = 0 lundi … 6 dimanche. */
export function dayFilterOf(param: string | undefined, weekday: number): DayFilter {
  if (param && param in DAY_FILTERS) return param as DayFilter;
  return weekday === 5 ? "samedi" : weekday === 6 ? "dimanche" : "semaine";
}

/** Dimanche de Pâques (calendrier grégorien, algorithme de Meeus) → AAAA-MM-JJ. */
function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const plusDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Jours fériés légaux belges d'une année (l'horaire SNCB y suit celui du dimanche). */
export function belgianHolidays(year: number): Set<string> {
  const e = easter(year);
  return new Set([
    `${year}-01-01`,
    plusDays(e, 1), // lundi de Pâques
    `${year}-05-01`,
    plusDays(e, 39), // Ascension
    plusDays(e, 50), // lundi de Pentecôte
    `${year}-07-21`,
    `${year}-08-15`,
    `${year}-11-01`,
    `${year}-11-11`,
    `${year}-12-25`,
  ]);
}

/**
 * Semaine de référence : 7 jours consécutifs à partir de `today` (AAAA-MM-JJ), rendus en AAAAMMJJ ; un jour férié est
 * remplacé par le même jour de la semaine suivante (sinon un mercredi 11 novembre afficherait l'horaire du dimanche).
 */
export function referenceWeek(today: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    let d = plusDays(today, i);
    while (belgianHolidays(Number(d.slice(0, 4))).has(d)) d = plusDays(d, 7);
    return d.replace(/-/g, "");
  });
}
