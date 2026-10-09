// Dates et heures en Europe/Brussels (corrige le bug B6 de BACO : date du jour calculée en UTC).

export const TZ = "Europe/Brussels";

function parts(date: Date): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)) {
    out[p.type] = p.value;
  }
  return out;
}

/** « AAAA-MM-JJ » du jour à Bruxelles. */
export function brusselsDay(date: Date = new Date()): string {
  const p = parts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** « HH:MM » à Bruxelles. */
export function brusselsTime(date: Date = new Date()): string {
  const p = parts(date);
  return `${p.hour}:${p.minute}`;
}

/** Jour « AAAA-MM-JJ » qui existe vraiment (2026-13-45 est refusé). */
export function isValidDay(day: string | undefined | null): day is string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const d = new Date(`${day}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

/** Ajoute n jours à un jour « AAAA-MM-JJ » (calcul en UTC, sans effet de l'heure d'été). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Décalage (minutes) de Bruxelles par rapport à UTC à un instant donné. */
function offsetMinutes(date: Date): number {
  const p = parts(date);
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!);
  return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000);
}

/** Jour + heure locales de Bruxelles → instant ISO UTC (pour les champs date de PocketBase). */
export function brusselsToUtc(day: string, time = "00:00"): string {
  const guess = new Date(`${day}T${time}:00Z`);
  const offset = offsetMinutes(guess);
  const utc = new Date(guess.getTime() - offset * 60000);
  // Second passage : corrige un décalage différent de part et d'autre d'un changement d'heure.
  const offset2 = offsetMinutes(utc);
  return new Date(guess.getTime() - offset2 * 60000).toISOString();
}

/** Date PocketBase (« 2026-10-08 10:00:00.000Z ») → Date. */
export function pbDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Jour de service d'une date PocketBase, à Bruxelles. */
export function dayOf(value: string | null | undefined): string {
  const d = pbDate(value);
  return d ? brusselsDay(d) : "";
}

const dayFormat = new Intl.DateTimeFormat("fr-BE", {
  timeZone: TZ,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});
const longFormat = new Intl.DateTimeFormat("fr-BE", {
  timeZone: TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const shortFormat = new Intl.DateTimeFormat("fr-BE", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** « jeu. 08/10 » */
export function formatDay(day: string): string {
  return day ? dayFormat.format(new Date(`${day}T12:00:00Z`)) : "—";
}
/** « jeudi 8 octobre 2026 » */
export function formatLongDay(day: string): string {
  return day ? longFormat.format(new Date(`${day}T12:00:00Z`)) : "—";
}
/** « 08/10/2026 » */
export function formatShortDay(day: string): string {
  return day ? shortFormat.format(new Date(`${day}T12:00:00Z`)) : "—";
}

/** « il y a 45 min », « il y a 3 h », « il y a 2 j » */
export function sinceLabel(from: Date, now: Date = new Date()): string {
  const min = Math.max(0, Math.round((now.getTime() - from.getTime()) / 60000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

/** Période B201 d'une heure « HH:MM » : matin 06–13, après-midi 13–21, nuit 21–06. */
export type Period = "matin" | "apres_midi" | "nuit";
export const PERIODS: { id: Period; label: string; range: string }[] = [
  { id: "matin", label: "Matin", range: "06 h – 13 h" },
  { id: "apres_midi", label: "Après-midi", range: "13 h – 21 h" },
  { id: "nuit", label: "Nuit", range: "21 h – 06 h" },
];
export function periodOf(time: string): Period {
  const h = Number.parseInt(time.slice(0, 2), 10);
  if (Number.isNaN(h)) return "matin";
  if (h >= 6 && h < 13) return "matin";
  if (h >= 13 && h < 21) return "apres_midi";
  return "nuit";
}

/** Nombre de jours de `from` à `to` (jours AAAA-MM-JJ, positif si `to` est après `from`). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}
