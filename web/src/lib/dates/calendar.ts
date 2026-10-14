/**
 * Dates et heures des champs de saisie (`DateField`, `TimeField`, `MonthField`) : logique pure, testée.
 * Valeurs toujours ISO (`AAAA-MM-JJ`, `HH:MM`, `AAAA-MM`) ; affichage français (`jj/mm/aaaa`).
 * Refonte de l'interface, lot R3 (14 oct. 2026) : fini le format du navigateur (mm/dd/yyyy sur un poste en anglais).
 */

export const pad2 = (n: number) => String(n).padStart(2, "0");

export type Ymd = { y: number; m: number; d: number };

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function toIso({ y, m, d }: Ymd): string {
  return `${String(y).padStart(4, "0")}-${pad2(m)}-${pad2(d)}`;
}

/** `AAAA-MM-JJ` valide → composantes ; sinon null. */
export function parseIso(iso: string | null | undefined): Ymd | null {
  const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!r) return null;
  const y = Number(r[1]);
  const m = Number(r[2]);
  const d = Number(r[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export const isIsoDate = (s: string | null | undefined) => parseIso(s) !== null;

function fromUtc(t: Date): string {
  return toIso({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
}

export function addDays(iso: string, n: number): string {
  const p = parseIso(iso);
  if (!p) return iso;
  return fromUtc(new Date(Date.UTC(p.y, p.m - 1, p.d + n)));
}

/** Ajoute des mois en gardant le jour dans le mois d'arrivée (31/01 + 1 mois → 28 ou 29/02). */
export function addMonths(iso: string, n: number): string {
  const p = parseIso(iso);
  if (!p) return iso;
  const idx = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return toIso({ y, m, d: Math.min(p.d, daysInMonth(y, m)) });
}

/** Jour de la semaine, lundi = 0 … dimanche = 6. */
export function weekday(iso: string): number {
  const p = parseIso(iso);
  if (!p) return 0;
  return (new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() + 6) % 7;
}

export const startOfWeek = (iso: string) => addDays(iso, -weekday(iso));
export const endOfWeek = (iso: string) => addDays(iso, 6 - weekday(iso));

const BRUSSELS_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Brussels",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const BRUSSELS_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Brussels",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Jour courant à Bruxelles (`AAAA-MM-JJ`). */
export function todayIso(now = new Date()): string {
  return BRUSSELS_DAY.format(now);
}

/** Heure courante à Bruxelles (`HH:MM`). */
export function nowTime(now = new Date()): string {
  return BRUSSELS_TIME.format(now);
}

/** `AAAA-MM-JJ` → `jj/mm/aaaa` (vide si invalide). */
export function formatDateFr(iso: string | null | undefined): string {
  const p = parseIso(iso);
  return p ? `${pad2(p.d)}/${pad2(p.m)}/${String(p.y).padStart(4, "0")}` : "";
}

function fullYear(y: string, ref: number): number {
  if (y.length === 4) return Number(y);
  if (y.length === 2) return 2000 + Number(y);
  return ref;
}

/**
 * Saisie libre → date ISO, ou null si incomplète / invalide. Accepte `14/10/2026`, `14-10-26`, `14.10`, `14102026`,
 * `141026`, `1410` (année de référence), `14` (mois et année de référence) et l'ISO collé (`2026-10-14`).
 */
export function parseDateText(text: string, ref: string = todayIso()): string | null {
  const t = text.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return isIsoDate(t) ? t : null;
  const r = parseIso(ref) ?? { y: 2026, m: 1, d: 1 };
  let d: string | undefined;
  let m: string | undefined;
  let y: string | undefined;
  if (/^\d+$/.test(t)) {
    if (t.length <= 2) d = t;
    else if (t.length === 4) [d, m] = [t.slice(0, 2), t.slice(2)];
    else if (t.length === 6 || t.length === 8)
      [d, m, y] = [t.slice(0, 2), t.slice(2, 4), t.slice(4)];
    else return null;
  } else {
    const parts = t.split(/[/.\-\s]+/).filter(Boolean);
    if (parts.length < 1 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
    [d, m, y] = parts;
    if ((d?.length ?? 0) > 2 || (m?.length ?? 0) > 2) return null;
    if (y !== undefined && y.length !== 2 && y.length !== 4) return null;
  }
  const out = {
    y: y === undefined ? r.y : fullYear(y, r.y),
    m: m === undefined ? r.m : Number(m),
    d: Number(d),
  };
  const iso = toIso(out);
  return isIsoDate(iso) ? iso : null;
}

/** Chiffres tapés à la suite → barres insérées (`1410` → `14/10`) ; tout autre texte est laissé tel quel. */
export function maskDateDigits(text: string): string {
  if (!/^\d{3,8}$/.test(text)) return text;
  const parts = [text.slice(0, 2), text.slice(2, 4), text.slice(4)].filter(Boolean);
  return parts.join("/");
}

/** Segment du champ `jj/mm/aaaa` sous le curseur. */
export function dateSegment(caret: number): "d" | "m" | "y" {
  return caret <= 2 ? "d" : caret <= 5 ? "m" : "y";
}

export function stepDate(iso: string, segment: "d" | "m" | "y", delta: number): string {
  if (segment === "d") return addDays(iso, delta);
  if (segment === "m") return addMonths(iso, delta);
  return addMonths(iso, 12 * delta);
}

export function clampDate(iso: string, min?: string, max?: string): string {
  if (min && isIsoDate(min) && iso < min) return min;
  if (max && isIsoDate(max) && iso > max) return max;
  return iso;
}

// ── Jours fériés belges ──────────────────────────────────────────────────────────────────────────

/** Dimanche de Pâques (calendrier grégorien, algorithme dit « anonyme » de Meeus / Jones / Butcher). */
export function easterSunday(year: number): string {
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
  return toIso({ y: year, m: month, d: day });
}

const holidayCache = new Map<number, Map<string, string>>();

/**
 * Jours fériés légaux en Belgique (10) + les dimanches de Pâques et de Pentecôte (repères de l'horaire).
 * Clé : date ISO, valeur : nom en français.
 */
export function belgianHolidays(year: number): Map<string, string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const easter = easterSunday(year);
  const y = (m: number, d: number) => toIso({ y: year, m, d });
  const list: [string, string][] = [
    [y(1, 1), "Nouvel An"],
    [easter, "Pâques"],
    [addDays(easter, 1), "Lundi de Pâques"],
    [y(5, 1), "Fête du Travail"],
    [addDays(easter, 39), "Ascension"],
    [addDays(easter, 49), "Pentecôte"],
    [addDays(easter, 50), "Lundi de Pentecôte"],
    [y(7, 21), "Fête nationale"],
    [y(8, 15), "Assomption"],
    [y(11, 1), "Toussaint"],
    [y(11, 11), "Armistice"],
    [y(12, 25), "Noël"],
  ];
  const map = new Map(list);
  holidayCache.set(year, map);
  return map;
}

export function holidayName(iso: string): string | undefined {
  const p = parseIso(iso);
  return p ? belgianHolidays(p.y).get(iso) : undefined;
}

/** Grille d'un mois : 6 semaines de 7 jours, du lundi au dimanche (jours des mois voisins compris). */
export function monthGrid(year: number, month: number): string[][] {
  const first = toIso({ y: year, m: month, d: 1 });
  let day = startOfWeek(first);
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

const MONTH_FMT = new Intl.DateTimeFormat("fr-BE", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const MONTH_SHORT = new Intl.DateTimeFormat("fr-BE", { month: "short", timeZone: "UTC" });
const DAY_LONG = new Intl.DateTimeFormat("fr-BE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const WEEKDAY_SHORT = new Intl.DateTimeFormat("fr-BE", { weekday: "short", timeZone: "UTC" });
const WEEKDAY_LONG = new Intl.DateTimeFormat("fr-BE", { weekday: "long", timeZone: "UTC" });

const utc = (iso: string) => {
  const p = parseIso(iso) ?? { y: 2026, m: 1, d: 1 };
  return new Date(Date.UTC(p.y, p.m - 1, p.d));
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** « Octobre 2026 ». */
export const monthLabel = (y: number, m: number) =>
  cap(MONTH_FMT.format(new Date(Date.UTC(y, m - 1, 1))));
/** « oct. ». */
export const monthShort = (m: number) => MONTH_SHORT.format(new Date(Date.UTC(2026, m - 1, 1)));
/** « mercredi 14 octobre 2026 ». */
export const dayLabel = (iso: string) => DAY_LONG.format(utc(iso));

/** En-têtes de colonnes du calendrier, du lundi au dimanche : `{ short: "lu", long: "lundi" }`. */
export const WEEKDAYS: { short: string; long: string }[] = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 12 + i)); // lundi 12 octobre 2026
  return {
    short: WEEKDAY_SHORT.format(d).replace(".", "").slice(0, 2),
    long: WEEKDAY_LONG.format(d),
  };
});

// ── Heures ───────────────────────────────────────────────────────────────────────────────────────

export const isTime = (s: string | null | undefined) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s ?? "");

/**
 * Saisie libre → `HH:MM`, ou null. Accepte `14:50`, `14h50`, `14.50`, `1450`, `945` (09:45), `9` (09:00), `14h`,
 * `14:5` (14:05).
 */
export function parseTimeText(text: string): string | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  let h: number;
  let m: number;
  const sep = /^(\d{1,2})\s*[:h.,]\s*(\d{0,2})$/.exec(t);
  if (sep) {
    h = Number(sep[1]);
    m = sep[2] ? Number(sep[2]) : 0;
  } else if (/^\d{1,4}$/.test(t)) {
    if (t.length <= 2) [h, m] = [Number(t), 0];
    else [h, m] = [Number(t.slice(0, -2)), Number(t.slice(-2))];
  } else return null;
  if (h > 23 || m > 59) return null;
  return `${pad2(h)}:${pad2(m)}`;
}

export function timeSegment(caret: number): "h" | "m" {
  return caret <= 2 ? "h" : "m";
}

/** ± `delta` minutes (tour d'horloge) ; avec `snap`, aligne d'abord sur un multiple de `snap` dans le sens choisi. */
export function stepTime(hhmm: string, delta: number, snap?: number): string {
  const r = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!r) return hhmm;
  let total = Number(r[1]) * 60 + Number(r[2]);
  if (snap && snap > 1 && total % snap !== 0) {
    total = delta > 0 ? Math.ceil(total / snap) * snap : Math.floor(total / snap) * snap;
  } else total += delta;
  total = ((total % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

// ── Mois ─────────────────────────────────────────────────────────────────────────────────────────

export const isMonth = (s: string | null | undefined) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s ?? "");

/** `AAAA-MM` → `mm/aaaa`. */
export function formatMonthFr(ym: string | null | undefined): string {
  return isMonth(ym) ? `${ym!.slice(5)}/${ym!.slice(0, 4)}` : "";
}

/** Saisie libre → `AAAA-MM` : `10/2026`, `10-26`, `102026`, `1026`, `2026-10`. */
export function parseMonthText(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (isMonth(t)) return t;
  let m: string | undefined;
  let y: string | undefined;
  if (/^\d{4}$|^\d{6}$/.test(t)) [m, y] = [t.slice(0, 2), t.slice(2)];
  else {
    const r = /^(\d{1,2})[/.\-\s]+(\d{2}|\d{4})$/.exec(t);
    if (!r) return null;
    [m, y] = [r[1], r[2]];
  }
  const month = Number(m);
  if (month < 1 || month > 12) return null;
  return `${fullYear(y!, 2026)}-${pad2(month)}`;
}

export function addMonthsYm(ym: string, n: number): string {
  if (!isMonth(ym)) return ym;
  const idx = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5)) - 1 + n;
  return `${Math.floor(idx / 12)}-${pad2((idx % 12) + 1)}`;
}
