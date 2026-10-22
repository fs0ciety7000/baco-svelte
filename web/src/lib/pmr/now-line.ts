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

/**
 * Une ligne de la liste (un trajet) : heure de départ (`start`, ordre de la liste), heure du débarquement à l'arrivée si
 * l'arrivée est assistée (`end`). `startAssisted: false` : le départ n'est pas une prise en charge (seule l'arrivée est
 * assistée), il sert à l'ordre mais n'est jamais « la prochaine ».
 */
export type NowItem = { start: string; end?: string; startAssisted?: boolean };

/** Un bout à venir : ligne, côté (IN au départ, OUT à l'arrivée) et heure. */
export type NowEnd = { index: number; side: "in" | "out"; time: string };

export type NowSplit = {
  /** Index où insérer le repère (avant cette ligne ; = longueur : en fin de liste) ; -1 : pas de repère (autre jour). */
  insertAt: number;
  /** Ligne de la prochaine prise en charge (départ OU arrivée, la plus proche) ; -1 s'il n'y en a plus. */
  next: number;
  /** Côté de la prochaine prise en charge (la pastille « Prochaine » va sur cette gare). */
  nextSide: "in" | "out";
  /** Heure de la prochaine prise en charge (vide s'il n'y en a plus). */
  nextTime: string;
  /** Ligne passée (estompée) : toutes ses prises en charge sont avant maintenant. */
  past: boolean[];
  /** Départ passé mais arrivée à venir : seule la gare de départ est estompée. */
  half: boolean[];
  /**
   * Arrivées à venir des trajets placés AVANT le repère (départ déjà passé) : rappelées sur le repère, triées par heure,
   * pour qu'un débarquement à venir ne se cache pas au-dessus de la ligne « maintenant ».
   */
  pending: NowEnd[];
};

/**
 * Découpe d'une liste triée par heure de départ, une ligne par trajet. Repère avant la première ligne dont le départ est
 * à venir ; une ligne est passée quand sa dernière prise en charge (`end`, sinon `start`) l'est. La prochaine prise en
 * charge compare départs ET arrivées (22 oct. 2026 : un débarquement à 20:09 passe avant un embarquement à 20:30).
 * Ligne sans heure : ni passée, ni repère.
 */
export function nowSplit(items: NowItem[], nowMin: number, phase: DayPhase): NowSplit {
  const none = items.map(() => false);
  if (phase !== "today")
    return {
      insertAt: -1,
      next: -1,
      nextSide: "in",
      nextTime: "",
      past: items.map(() => phase === "past"),
      half: none,
      pending: [],
    };
  let insertAt = items.length;
  let best: NowEnd | null = null;
  let bestMin = Infinity;
  const consider = (index: number, side: "in" | "out", time: string, m: number) => {
    // À égalité, la ligne la plus haute, puis le départ.
    if (m < bestMin) {
      best = { index, side, time };
      bestMin = m;
    }
  };
  const past: boolean[] = [];
  const half: boolean[] = [];
  const outs: { index: number; time: string; m: number }[] = [];
  items.forEach((it, i) => {
    const s = toMinutes(it.start);
    const e = toMinutes(it.end ?? "");
    if (s !== null && s >= nowMin && insertAt === items.length) insertAt = i;
    if (s !== null && s >= nowMin && it.startAssisted !== false) consider(i, "in", it.start, s);
    if (e !== null && e >= nowMin) {
      consider(i, "out", it.end!, e);
      outs.push({ index: i, time: it.end!, m: e });
    }
    const last = e ?? s;
    past.push(last !== null && last < nowMin);
    half.push(s !== null && s < nowMin && e !== null && e >= nowMin);
  });
  const pending = outs
    .filter((o) => o.index < insertAt)
    .sort((a, b) => a.m - b.m || a.index - b.index)
    .map(({ index, time }) => ({ index, side: "out" as const, time }));
  const b = best as NowEnd | null;
  return {
    insertAt,
    next: b ? b.index : -1,
    nextSide: b ? b.side : "in",
    nextTime: b ? b.time : "",
    past,
    half,
    pending,
  };
}

/** Découpe neutre (pas de repère : Historique, autre format). */
export function noSplit(n: number): NowSplit {
  return {
    insertAt: -1,
    next: -1,
    nextSide: "in",
    nextTime: "",
    past: Array.from({ length: n }, () => false),
    half: Array.from({ length: n }, () => false),
    pending: [],
  };
}

/** Arrivée à venir rappelée sur le repère : train, heure, gare d'arrivée, ligne à rejoindre. */
export type PendingArrival = { id: string; train: string; time: string; station: string };

/** Arrivées à venir des trajets au-dessus du repère, prêtes à afficher (`pick` lit la ligne). */
export function pendingArrivals<T>(
  split: NowSplit,
  list: T[],
  pick: (row: T) => { id: string; train: string; station: string },
): PendingArrival[] {
  return split.pending.flatMap((p) => {
    const row = list[p.index];
    return row ? [{ ...pick(row), time: p.time }] : [];
  });
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
