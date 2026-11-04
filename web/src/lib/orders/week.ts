// Semaines ISO 8601 (lundi → dimanche) des récapitulatifs d'archives (4 nov. 2026). Jours « AAAA-MM-JJ » (date de service
// à Bruxelles) ; calculs en UTC sur ces jours, jamais sur une heure. Pur, testé.

export type IsoWeek = { year: number; week: number };

const DAY_MS = 86_400_000;
const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

const toUtc = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Semaine ISO d'un jour : l'année ISO est celle du jeudi de la semaine (le 1er janvier peut tomber en semaine 53). */
export function isoWeekOf(day: string): IsoWeek {
  const t = toUtc(day);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // lundi = 0
  const thursday = t + (3 - dow) * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const jan4 = Date.UTC(year, 0, 4);
  const jan4dow = (new Date(jan4).getUTCDay() + 6) % 7;
  const week1Monday = jan4 - jan4dow * DAY_MS;
  return { year, week: Math.floor((thursday - week1Monday) / (7 * DAY_MS)) + 1 };
}

/** Clé « 2026-W45 ». */
export function weekKey(w: IsoWeek): string {
  return `${w.year}-W${String(w.week).padStart(2, "0")}`;
}

export const weekKeyOf = (day: string) => weekKey(isoWeekOf(day));

/** Lit « 2026-W45 » ; null si la clé est mal formée ou si la semaine n'existe pas (W53 d'une année à 52 semaines). */
export function parseWeekKey(key: string): IsoWeek | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) return null;
  const w = { year: +m[1]!, week: +m[2]! };
  if (w.week < 1 || w.week > 53 || w.year < 2000 || w.year > 2100) return null;
  const { from } = weekBounds(w);
  return weekKeyOf(from) === key ? w : null;
}

/** Lundi et dimanche d'une semaine ISO. */
export function weekBounds(w: IsoWeek): { from: string; to: string } {
  const jan4 = Date.UTC(w.year, 0, 4);
  const jan4dow = (new Date(jan4).getUTCDay() + 6) % 7;
  const monday = jan4 - jan4dow * DAY_MS + (w.week - 1) * 7 * DAY_MS;
  return { from: toDay(monday), to: toDay(monday + 6 * DAY_MS) };
}

/** « du 2 au 8 novembre 2026 », « du 28 septembre au 4 octobre 2026 », « du 29 décembre 2025 au 4 janvier 2026 ». */
export function rangeLabel(from: string, to: string): string {
  const d = (s: string) => +s.slice(8, 10);
  const m = (s: string) => MONTHS[+s.slice(5, 7) - 1]!;
  const y = (s: string) => s.slice(0, 4);
  if (y(from) !== y(to)) return `du ${d(from)} ${m(from)} ${y(from)} au ${d(to)} ${m(to)} ${y(to)}`;
  if (m(from) !== m(to)) return `du ${d(from)} ${m(from)} au ${d(to)} ${m(to)} ${y(to)}`;
  return `du ${d(from)} au ${d(to)} ${m(to)} ${y(to)}`;
}

/** « Semaine 45 · du 2 au 8 novembre 2026 ». */
export function weekLabel(w: IsoWeek): string {
  const { from, to } = weekBounds(w);
  return `Semaine ${w.week} · ${rangeLabel(from, to)}`;
}

/** « novembre 2026 » d'un mois « AAAA-MM ». */
export function monthLabelFr(month: string): string {
  return `${MONTHS[+month.slice(5, 7) - 1] ?? ""} ${month.slice(0, 4)}`;
}

/** Premier et dernier jour d'un mois « AAAA-MM ». */
export function monthBounds(month: string): { from: string; to: string } {
  const y = +month.slice(0, 4);
  const mo = +month.slice(5, 7);
  return { from: `${month}-01`, to: toDay(Date.UTC(y, mo, 0)) };
}

/** Lignes regroupées par semaine ISO de leur jour, semaine la plus récente d'abord ; lignes sans jour écartées. */
export function groupByWeek<T>(
  rows: T[],
  dayOf: (r: T) => string,
): { key: string; week: IsoWeek; rows: T[] }[] {
  const map = new Map<string, { key: string; week: IsoWeek; rows: T[] }>();
  for (const r of rows) {
    const day = dayOf(r);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const week = isoWeekOf(day);
    const key = weekKey(week);
    const g = map.get(key) ?? { key, week, rows: [] };
    g.rows.push(r);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
}
