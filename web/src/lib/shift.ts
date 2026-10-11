import { z } from "zod";

import { addDays, brusselsDay, brusselsToUtc } from "@/lib/orders/time";

// Service de l'agent (widget « Fin de service », demande du 11 oct. 2026) : l'agent choisit AM, PM, Nuit ou Extra et
// l'accueil décompte le temps restant. Heures de Bruxelles ; la nuit déborde sur le lendemain.

export const SHIFTS = {
  am: { label: "AM", start: "06:00", end: "14:00" },
  pm: { label: "PM", start: "14:00", end: "22:00" },
  nuit: { label: "Nuit", start: "22:00", end: "06:00" },
  extra: { label: "Extra", start: "08:00", end: "16:00" },
} as const;
export type ShiftKind = keyof typeof SHIFTS;
export const SHIFT_KINDS = Object.keys(SHIFTS) as ShiftKind[];

/** Choix enregistré dans `users.preferences.shift` : service + jour de prise de service (Bruxelles). */
export const shiftChoiceSchema = z.object({
  kind: z.enum(SHIFT_KINDS as [ShiftKind, ...ShiftKind[]]),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type ShiftChoice = z.infer<typeof shiftChoiceSchema>;

export function parseShift(value: unknown): ShiftChoice | null {
  const r = shiftChoiceSchema.safeParse(value);
  return r.success ? r.data : null;
}

/** Début et fin (instants) d'un service pris le jour `day`. */
export function shiftWindow(kind: ShiftKind, day: string): { start: Date; end: Date } {
  const s = SHIFTS[kind];
  const endDay = s.end <= s.start ? addDays(day, 1) : day;
  return {
    start: new Date(brusselsToUtc(day, s.start)),
    end: new Date(brusselsToUtc(endDay, s.end)),
  };
}

/**
 * Jour de prise de service quand l'agent choisit `kind` à l'instant `now` : la veille si ce service-là est encore en
 * cours (nuit choisie à 3 h), sinon aujourd'hui.
 */
export function shiftDayFor(kind: ShiftKind, now: Date = new Date()): string {
  const today = brusselsDay(now);
  const yesterday = addDays(today, -1);
  return shiftWindow(kind, yesterday).end > now ? yesterday : today;
}

export type ShiftState =
  | { phase: "avant"; start: Date; end: Date; untilStart: number }
  | { phase: "en-cours"; start: Date; end: Date; remaining: number; progress: number }
  | { phase: "termine"; start: Date; end: Date; since: number };

/** État du service à `now` (durées en millisecondes). */
export function shiftState(choice: ShiftChoice, now: Date = new Date()): ShiftState {
  const { start, end } = shiftWindow(choice.kind, choice.day);
  const t = now.getTime();
  if (t < start.getTime()) return { phase: "avant", start, end, untilStart: start.getTime() - t };
  if (t >= end.getTime()) return { phase: "termine", start, end, since: t - end.getTime() };
  const total = end.getTime() - start.getTime();
  return {
    phase: "en-cours",
    start,
    end,
    remaining: end.getTime() - t,
    progress: (t - start.getTime()) / total,
  };
}

/** Un choix périmé (service fini depuis plus de 6 h) n'est plus affiché : l'agent rechoisit. */
export function isStale(choice: ShiftChoice, now: Date = new Date()): boolean {
  const s = shiftState(choice, now);
  return s.phase === "termine" && s.since > 6 * 3600_000;
}

/** « 3 h 07 », « 42 min 05 s » (moins d'une heure : secondes affichées). */
export function durationLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")}`;
  return `${m} min ${String(s).padStart(2, "0")} s`;
}

/** « 02:41:05 » pour le grand compteur. */
export function clockLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(total / 3600))}:${p(Math.floor((total % 3600) / 60))}:${p(total % 60)}`;
}
