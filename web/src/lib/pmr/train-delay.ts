import { normalizeTrain } from "@/lib/ops/irail";

import { stationKey } from "./model";

// Retards des trains des missions PMR / groupes (demande du 10 oct. 2026). Le cron PocketBase `mission-trains` lit iRail
// et enregistre l'état de chaque train du jour (`mission_trains`) ; ici, le calcul pur du retard à la gare assistée.

export type TrainStop = { st: string; t: string; d: number; c: boolean; l: boolean };
export type TrainState = {
  delay: number;
  cancelled: boolean;
  stops: TrainStop[];
  checkedAt: string;
};
export type TrainStates = Record<string, TrainState>;

/** Seuil d'affichage et d'alerte (minutes) : en dessous, le train est considéré à l'heure. */
export const DELAY_SHOWN = 5;

export function trainKey(day: string, train: string): string {
  const id = normalizeTrain(train);
  return id ? `${day}|${id}` : "";
}

/** Arrêt d'une gare de mission : nom replié identique, sinon l'un commence par l'autre (miroir du hook). */
export function stopAt(state: TrainState | undefined, station: string): TrainStop | null {
  const k = stationKey(station);
  if (!state || !k) return null;
  let best: TrainStop | null = null;
  for (const s of state.stops) {
    const n = stationKey(s.st);
    if (n === k) return s;
    if (!best && (n.startsWith(k) || k.startsWith(n))) best = s;
  }
  return best;
}

export type Impact = { delay: number; cancelled: boolean; station: string; left: boolean };

type Legs = {
  day: string;
  train: string;
  transport: string;
  station: string;
  otherStation: string;
  inAssist: boolean;
  outAssist: boolean;
};

/**
 * Impact du train sur une mission : pire situation des gares assistées (IN → départ, OUT → arrivée ; sans sens connu,
 * le départ). Suppression avant retard. `null` si le train n'est pas suivi, est un taxi, ou est à l'heure.
 */
export function missionImpact(m: Legs, states: TrainStates | undefined): Impact | null {
  if (!states || m.transport === "taxi") return null;
  const state = states[trainKey(m.day, m.train)];
  if (!state) return null;
  const legs: string[] = [];
  if (m.inAssist || !m.outAssist) legs.push(m.station);
  if (m.outAssist && m.otherStation) legs.push(m.otherStation);
  let worst: Impact | null = null;
  for (const st of legs) {
    const s = stopAt(state, st);
    if (!s) continue;
    const imp: Impact = { delay: s.d, cancelled: s.c, station: s.st, left: s.l };
    if (!imp.cancelled && imp.delay < DELAY_SHOWN) continue;
    if (
      !worst ||
      (imp.cancelled && !worst.cancelled) ||
      (imp.cancelled === worst.cancelled && imp.delay > worst.delay)
    )
      worst = imp;
  }
  return worst;
}
