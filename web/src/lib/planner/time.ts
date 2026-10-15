// Heures du planificateur en Europe/Brussels. Un seul formateur Intl (le construire coûte cher : l'attribution
// automatique compare des milliers de tâches).

import { holidayName } from "@/lib/dates/calendar";
import { TZ } from "@/lib/orders/time";

export const MINUTE = 60_000;

const FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export type BrusselsParts = { day: string; hour: number; minute: number; weekday: number };

const partsCache = new Map<number, BrusselsParts>();

/** Jour, heure, minute et jour de semaine (0 = dimanche) d'un instant, à Bruxelles (mis en cache par minute). */
export function brusselsParts(ms: number): BrusselsParts {
  const key = Math.floor(ms / MINUTE);
  const hit = partsCache.get(key);
  if (hit) return hit;
  const out = computeParts(key * MINUTE);
  if (partsCache.size > 20_000) partsCache.clear();
  partsCache.set(key, out);
  return out;
}

function computeParts(ms: number): BrusselsParts {
  const p: Record<string, string> = {};
  for (const part of FMT.formatToParts(new Date(ms))) p[part.type] = part.value;
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    weekday: WEEKDAY[p.weekday ?? ""] ?? 0,
  };
}

/** ISO → millisecondes (NaN si illisible). Accepte aussi le format PocketBase « 2026-10-15 07:00:00.000Z ». */
export function toMs(iso: string | undefined | null): number {
  if (!iso) return Number.NaN;
  return Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T"));
}

export const toIso = (ms: number) => new Date(ms).toISOString();

/** « 07h05 » à Bruxelles. */
export function hhmm(ms: number): string {
  const p = brusselsParts(ms);
  return `${String(p.hour).padStart(2, "0")}h${String(p.minute).padStart(2, "0")}`;
}

/** « 07h00-07h20 ». */
export const range = (s: number, e: number) => `${hhmm(s)}-${hhmm(e)}`;

/** Week-end ou jour férié belge à Bruxelles (horaire « week-end » des guichets B-CS). */
export function isWeekendOrHoliday(ms: number): boolean {
  const p = brusselsParts(ms);
  return p.weekday === 0 || p.weekday === 6 || holidayName(p.day) !== undefined;
}

/** Début de l'heure civile (Bruxelles) qui contient l'instant. */
export function hourStart(ms: number): number {
  const p = brusselsParts(ms);
  return Math.floor(ms / MINUTE) * MINUTE - p.minute * MINUTE;
}

/** « HH:MM-HH:MM » → minutes depuis minuit [ouverture, fermeture] ; null si illisible. */
export function parseHours(hours: string | undefined | null): [number, number] | null {
  const m = /^\s*(\d{1,2})[:h](\d{2})\s*-\s*(\d{1,2})[:h](\d{2})\s*$/i.exec(hours ?? "");
  if (!m) return null;
  const a = Number(m[1]) * 60 + Number(m[2]);
  const b = Number(m[3]) * 60 + Number(m[4]);
  if (a > 24 * 60 || b > 24 * 60) return null;
  return [a, b];
}
