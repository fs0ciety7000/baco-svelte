// Trajet d'un bon (bus ou taxi) tiré du référentiel des trains (demande du 14 oct. 2026) : à partir des gares de départ
// et d'arrivée, les trains qui passent par les deux (dans l'ordre) donnent les lignes traversées et les arrêts à
// proposer ; un n° de train donne tout le trajet. Logique pure, partagée par le serveur (Server Actions) et les
// formulaires. Le rédacteur du bon garde la main : tout reste modifiable.

import { foldStation } from "@/lib/stations/search";
import type { ServiceStop } from "@/lib/timetable/model";

/** Train du référentiel tel que lu pour un bon (champs utiles seulement). */
export type RouteTrain = {
  number: number;
  type: string;
  relation: string;
  origin: string;
  terminus: string;
  days: number;
  stops: ServiceStop[];
};

/** Trajet d'un train entre deux gares. */
export type TrainLeg = {
  number: number;
  type: string;
  relation: string;
  /** Noms (FR) des gares de départ et d'arrivée tels que le train les nomme. */
  from: string;
  to: string;
  /** Heures au départ (départ, sinon arrivée) et à l'arrivée ; vides si inconnues (passage). */
  depTime: string;
  arrTime: string;
  /** Lignes d'infrastructure parcourues, dans l'ordre (ligne de chaque point, de la gare de départ à la veille de
   * l'arrivée : la ligne d'un point est celle du tronçon qui en part). */
  lines: string[];
  /** Gares où le train s'arrête entre les deux (exclues). */
  stops: string[];
  /** Tous les points entre les deux, passages sans arrêt compris (sert à ordonner les propositions). */
  points: string[];
  /** Trajet lu sur un train de sens inverse (arrivée → départ), retourné : heures sans objet. */
  reversed?: true;
};

export type TrainRoute = {
  /** Train le plus « omnibus » (L, S, P d'abord ; le plus d'arrêts). */
  omnibus: TrainLeg;
  /** Train le plus direct (IC d'abord ; le moins d'arrêts). */
  direct: TrainLeg;
  /** Gares où au moins un train s'arrête entre les deux, dans l'ordre du trajet. */
  proposed: string[];
  /** Nombre de trains qui relient les deux gares (le jour du bon s'il y en a). */
  trains: number;
};

/** Noms repliés d'une saisie (le serveur y ajoute les noms FR / NL et alias du référentiel des gares). */
export const keysOf = (...names: (string | undefined)[]): Set<string> =>
  new Set(names.map((n) => foldStation(n ?? "")).filter(Boolean));

function matches(stop: ServiceStop, keys: Set<string>): boolean {
  return keys.has(foldStation(stop.n)) || (!!stop.t && keys.has(foldStation(stop.t)));
}

/** Trajet du train entre les deux gares (départ avant arrivée), null s'il ne passe pas par les deux dans cet ordre. */
export function legOf(train: RouteTrain, dep: Set<string>, arr: Set<string>): TrainLeg | null {
  const i = train.stops.findIndex((s) => matches(s, dep));
  if (i < 0) return null;
  let j = -1;
  for (let k = i + 1; k < train.stops.length; k++)
    if (matches(train.stops[k]!, arr)) {
      j = k;
      break;
    }
  if (j < 0) return null;
  const between = train.stops.slice(i + 1, j);
  const lines: string[] = [];
  for (const s of train.stops.slice(i, j)) if (s.l && lines.at(-1) !== s.l) lines.push(s.l);
  const a = train.stops[i]!;
  const b = train.stops[j]!;
  return {
    number: train.number,
    type: train.type,
    relation: train.relation,
    from: a.n,
    to: b.n,
    depTime: a.d || a.a || "",
    arrTime: b.a || b.d || "",
    lines: [...new Set(lines)],
    stops: between.filter((s) => !s.p).map((s) => s.n),
    points: between.map((s) => s.n),
  };
}

/** Trajet d'un train de sens inverse (il passe par l'arrivée puis par le départ), remis dans le sens du bon. */
export function reverseLegOf(
  train: RouteTrain,
  dep: Set<string>,
  arr: Set<string>,
): TrainLeg | null {
  const leg = legOf(train, arr, dep);
  if (!leg) return null;
  return {
    ...leg,
    from: leg.to,
    to: leg.from,
    depTime: "",
    arrTime: "",
    lines: [...leg.lines].reverse(),
    stops: [...leg.stops].reverse(),
    points: [...leg.points].reverse(),
    reversed: true,
  };
}

const OMNIBUS = ["L", "S", "P"];

/** Bit du jour de la semaine d'une date « AAAA-MM-JJ » (lundi = 1 … dimanche = 64) ; 0 si la date est invalide. */
export function dayBit(day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 0;
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  return Number.isNaN(dow) ? 0 : 1 << ((dow + 6) % 7);
}

/** Fusionne les points de plusieurs trajets en un ordre unique (un nom inconnu se place après son prédécesseur). */
export function mergeOrder(sequences: string[][]): string[] {
  const out: string[] = [];
  const pos = (name: string) => out.findIndex((x) => foldStation(x) === foldStation(name));
  for (const seq of sequences) {
    let after = -1;
    for (const name of seq) {
      const p = pos(name);
      if (p >= 0) {
        after = p;
        continue;
      }
      out.splice(after + 1, 0, name);
      after += 1;
    }
  }
  return out;
}

/**
 * Trajet entre deux gares d'après les trains qui les relient. Un bus roule dans les deux sens : les trains de sens
 * inverse comptent aussi (retournés), après ceux du bon sens (Charleroi-Central → Mons : aucun omnibus direct dans ce
 * sens, le L de Mons → Charleroi donne les arrêts). `day` (bit du jour, facultatif) : seuls les trains qui circulent
 * ce jour-là, s'il y en a. Null si aucun train ne passe par les deux gares.
 */
export function trainRoute(
  trains: RouteTrain[],
  dep: Set<string>,
  arr: Set<string>,
  day = 0,
): TrainRoute | null {
  type Item = { t: RouteTrain; leg: TrainLeg };
  const collect = (reverse: boolean) =>
    trains
      .map((t) => ({ t, leg: reverse ? reverseLegOf(t, dep, arr) : legOf(t, dep, arr) }))
      .filter((x): x is Item => !!x.leg);
  const today = (items: Item[]) => {
    if (!day) return items;
    const on = items.filter((x) => x.t.days & day);
    return on.length ? on : items;
  };
  const forward = today(collect(false));
  const backward = today(collect(true));
  if (!forward.length && !backward.length) return null;
  const legs = [...forward, ...backward];
  // Premier vivier non vide : bon sens et type voulu, sens inverse et type voulu, puis n'importe quel train.
  const first = (want: (x: Item) => boolean) =>
    [forward.filter(want), backward.filter(want), forward, backward].find((p) => p.length)!;
  const byNumber = (a: TrainLeg, b: TrainLeg) => a.number - b.number;
  const omnibus = first((x) => OMNIBUS.includes(x.t.type))
    .map((x) => x.leg)
    .sort(
      (a, b) =>
        b.stops.length - a.stops.length ||
        OMNIBUS.indexOf(a.type) - OMNIBUS.indexOf(b.type) ||
        byNumber(a, b),
    )[0]!;
  const direct = first((x) => x.t.type === "IC")
    .map((x) => x.leg)
    .sort((a, b) => a.stops.length - b.stops.length || byNumber(a, b))[0]!;
  // Ordre : le trajet le plus détaillé d'abord (passages compris), puis les autres.
  const sequences = legs
    .map((x) => x.leg.points)
    .sort((a, b) => b.length - a.length)
    .slice(0, 60);
  const stopped = new Set(legs.flatMap((x) => x.leg.stops.map(foldStation)));
  const proposed = mergeOrder(sequences).filter((n) => stopped.has(foldStation(n)));
  return { omnibus, direct, proposed, trains: forward.length || backward.length };
}

/** Variante d'un n° de train qui circule le jour du bon (sinon celle qui circule le plus de jours). */
export function pickVariant<T extends { days: number }>(variants: T[], day = 0): T | null {
  if (!variants.length) return null;
  const sorted = [...variants].sort((a, b) => bitCount(b.days) - bitCount(a.days));
  return (day && sorted.find((v) => v.days & day)) || sorted[0]!;
}

function bitCount(n: number): number {
  let c = 0;
  for (let x = n; x; x &= x - 1) c++;
  return c;
}

/**
 * Gares d'un bon pré-remplies par un train : celles du rédacteur sont gardées si le train y passe dans l'ordre ; sinon
 * l'origine et / ou le terminus du train les remplacent. Renvoie aussi le trajet du train entre les deux.
 */
export function stationsFromTrain(
  train: RouteTrain,
  origin: string,
  destination: string,
): { origin: string; destination: string; leg: TrainLeg | null } {
  const index = (name: string) => {
    const k = keysOf(name);
    return k.size ? train.stops.findIndex((s) => matches(s, k)) : -1;
  };
  const first = train.stops[0]?.n ?? train.origin;
  const last = train.stops.at(-1)?.n ?? train.terminus;
  const o = index(origin);
  const d = index(destination);
  let from = first;
  let to = last;
  if (o >= 0 && d > o) {
    from = train.stops[o]!.n;
    to = train.stops[d]!.n;
  } else if (o >= 0 && o < train.stops.length - 1) {
    from = train.stops[o]!.n;
  } else if (d > 0) {
    to = train.stops[d]!.n;
  }
  return { origin: from, destination: to, leg: legOf(train, keysOf(from), keysOf(to)) };
}
