import { fromMinutes, toMinutes } from "@/lib/ops/timeline";

// « Où en est-on dans la journée ? » (15 oct. 2026, Missions PMR et Groupes) : repère « maintenant » inséré dans la liste
// entre la dernière mission passée et la prochaine, missions passées estompées, prochaine mise en avant, mini-frise de
// la journée (densité des prises en charge, curseur). Logique PURE, testée ; heures « HH:MM » de Bruxelles.

const brusselsHm = new Intl.DateTimeFormat("fr-BE", {
  timeZone: "Europe/Brussels",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Minutes écoulées depuis minuit à Bruxelles. */
export function brusselsMinutes(d: Date): number {
  return toMinutes(brusselsHm.format(d)) ?? 0;
}

export type DayPhase = "past" | "today" | "future";

/** Position d'un jour « AAAA-MM-JJ » par rapport à aujourd'hui. */
export function dayPhase(day: string, today: string): DayPhase {
  return day < today ? "past" : day > today ? "future" : "today";
}

/** Une ligne de la liste : heure de la première prise en charge, et de la dernière (débarquement à l'arrivée). */
export type NowItem = { start: string; end?: string };

export type NowSplit = {
  /** Index où insérer le repère (avant cette ligne ; = longueur : en fin de liste) ; -1 : pas de repère (autre jour). */
  insertAt: number;
  /** Index de la prochaine mission (première dont l'heure n'est pas passée) ; -1 s'il n'y en a plus. */
  next: number;
  /** Ligne passée (estompée) : toutes ses prises en charge sont avant maintenant. */
  past: boolean[];
};

/**
 * Découpe d'une liste triée par heure. Repère avant la première ligne dont l'heure de départ est à venir ; une ligne
 * est passée quand sa dernière prise en charge (`end`, sinon `start`) l'est. Ligne sans heure : ni passée, ni repère.
 */
export function nowSplit(items: NowItem[], nowMin: number, phase: DayPhase): NowSplit {
  if (phase !== "today") return { insertAt: -1, next: -1, past: items.map(() => phase === "past") };
  let insertAt = items.length;
  const past = items.map((it, i) => {
    const s = toMinutes(it.start);
    if (s !== null && s >= nowMin && insertAt === items.length) insertAt = i;
    const e = toMinutes(it.end ?? "") ?? s;
    return e !== null && e < nowMin;
  });
  return { insertAt, next: insertAt < items.length ? insertAt : -1, past };
}

/** « dans 12 min », « dans 1 h 05 » ; vide si l'heure est passée ou inconnue. */
export function untilLabel(hm: string, nowMin: number): string {
  const t = toMinutes(hm);
  if (t === null || t < nowMin) return "";
  const d = t - nowMin;
  if (d === 0) return "maintenant";
  if (d < 60) return `dans ${d} min`;
  return `dans ${Math.floor(d / 60)} h ${String(d % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------------------------------
// Mini-frise de la journée

export type StripRange = { from: number; to: number };

/** Plage de la frise : 6 h – 22 h au moins, élargie aux heures pleines des prises en charge du jour. */
export function stripRange(times: string[]): StripRange {
  let from = 6 * 60;
  let to = 22 * 60;
  for (const t of times) {
    const m = toMinutes(t);
    if (m === null || m >= 24 * 60) continue;
    from = Math.min(from, m);
    to = Math.max(to, m + 1);
  }
  return { from: Math.floor(from / 60) * 60, to: Math.min(24 * 60, Math.ceil(to / 60) * 60) };
}

export type StripBucket = { from: number; to: number; count: number };

/** Prises en charge par tranche (30 min par défaut) sur la plage. */
export function stripBuckets(times: string[], range: StripRange, step = 30): StripBucket[] {
  const out: StripBucket[] = [];
  for (let a = range.from; a < range.to; a += step) out.push({ from: a, to: a + step, count: 0 });
  for (const t of times) {
    const m = toMinutes(t);
    if (m === null || m < range.from || m >= range.to) continue;
    const b = out[Math.floor((m - range.from) / step)];
    if (b) b.count++;
  }
  return out;
}

/** Position (0 – 100 %) d'une minute sur la frise, bornée. */
export function stripPct(min: number, range: StripRange): number {
  const span = Math.max(1, range.to - range.from);
  return Math.min(100, Math.max(0, ((min - range.from) / span) * 100));
}

/** Graduations toutes les `every` heures (« 06 », « 08 »…), avec leur position. */
export function stripTicks(range: StripRange, every = 2): { label: string; pct: number }[] {
  const out: { label: string; pct: number }[] = [];
  const first = Math.ceil(range.from / 60 / every) * every;
  for (let h = first; h * 60 <= range.to; h += every)
    out.push({ label: String(h % 24).padStart(2, "0"), pct: stripPct(h * 60, range) });
  return out;
}

/** Ligne vers laquelle défiler pour une minute : la première à cette heure ou après, sinon la dernière. */
export function indexAtMinute(starts: string[], minute: number): number {
  if (!starts.length) return -1;
  const i = starts.findIndex((s) => {
    const m = toMinutes(s);
    return m !== null && m >= minute;
  });
  return i >= 0 ? i : starts.length - 1;
}

export { fromMinutes };
