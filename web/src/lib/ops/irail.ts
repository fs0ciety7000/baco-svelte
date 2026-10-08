import { z } from "zod";

// Modèle des données iRail (trains en direct), partagé client / serveur. Les réponses brutes d'iRail sont
// normalisées côté serveur (src/server/irail.ts) : le navigateur ne voit que ces types.

export type Station = { id: string; name: string; lat: number; lon: number };

export type BoardRow = {
  /** Identifiant iRail du train, sans préfixe (« IC2134 »). */
  train: string;
  /** Libellé lisible (« IC 2134 »). */
  label: string;
  /** Gare de destination (départs) ou d'origine (arrivées). */
  other: string;
  /** Heure prévue (epoch ms). */
  at: number;
  delayMin: number;
  cancelled: boolean;
  left: boolean;
  platform: string;
  platformChanged: boolean;
  extra: boolean;
  occupancy: string;
};

export type Board = {
  station: string;
  stationId: string;
  kind: "departure" | "arrival";
  rows: BoardRow[];
  fetchedAt: number;
};

export type TrainStop = {
  station: string;
  stationId: string;
  at: number;
  arrivalAt: number;
  delayMin: number;
  cancelled: boolean;
  left: boolean;
  arrived: boolean;
  platform: string;
  platformChanged: boolean;
  extra: boolean;
};

export type Train = {
  train: string;
  label: string;
  day: string;
  stops: TrainStop[];
  fetchedAt: number;
};

export type CompositionUnit = {
  type: string;
  seats1: number;
  seats2: number;
  prm: boolean;
  bike: boolean;
  toilets: boolean;
  airco: boolean;
};
export type Composition = { segments: { from: string; to: string; units: CompositionUnit[] }[] };

export type Disturbance = {
  id: string;
  title: string;
  description: string;
  kind: "incident" | "travaux";
  at: number;
};

/** « IC 2134 », « ic2134 », « 2134 », « BE.NMBS.IC2134 » → « IC2134 » / « 2134 » ; vide si illisible. */
export function normalizeTrain(input: string): string {
  const s = input
    .trim()
    .toUpperCase()
    .replace(/^BE\.NMBS\./, "")
    .replace(/\s+/g, "");
  return /^[A-Z]{0,4}\d{1,6}$/.test(s) ? s : "";
}

/** Le texte saisi ressemble-t-il à un numéro de train plutôt qu'à une gare ? */
export function looksLikeTrain(input: string): boolean {
  return /^\s*(?:[A-Za-z]{1,4}\s?)?\d{2,6}\s*$/.test(input);
}

export function trainLabel(train: string): string {
  const m = /^([A-Z]+)(\d+)$/.exec(train);
  return m ? `${m[1]} ${m[2]}` : train;
}

export const stationId = z.string().regex(/^BE\.NMBS\.\d{9}$/, "Gare inconnue");
export const trainId = z
  .string()
  .transform(normalizeTrain)
  .pipe(z.string().min(1, "Numéro de train illisible"));
export const ddmmyy = (day: string) => `${day.slice(8, 10)}${day.slice(5, 7)}${day.slice(2, 4)}`;

export type DelayTone = "ok" | "warn" | "danger" | "neutral";
/** Seuils de l'audit : warn dès 5 min, danger dès 15 min ou supprimé. */
export function delayTone(delayMin: number, cancelled: boolean): DelayTone {
  if (cancelled) return "danger";
  if (delayMin >= 15) return "danger";
  if (delayMin >= 5) return "warn";
  return "ok";
}

export function delayLabel(delayMin: number, cancelled: boolean): string {
  if (cancelled) return "Supprimé";
  if (delayMin <= 0) return "À l'heure";
  return `+${delayMin} min`;
}

export type FavoriteStation = { id: string; name: string };

export function parseFavorites(preferences: unknown): FavoriteStation[] {
  const ops = (preferences as { operations?: { favoriteStations?: unknown } } | null)?.operations;
  const list = Array.isArray(ops?.favoriteStations) ? ops.favoriteStations : [];
  return list
    .filter(
      (f): f is FavoriteStation =>
        !!f &&
        typeof (f as FavoriteStation).id === "string" &&
        typeof (f as FavoriteStation).name === "string" &&
        stationId.safeParse((f as FavoriteStation).id).success,
    )
    .slice(0, 8);
}
