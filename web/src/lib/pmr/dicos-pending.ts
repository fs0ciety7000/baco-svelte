import { z } from "zod";

import { brusselsToUtc, isValidDay } from "@/lib/orders/time";

import { DICOS_SYMBOL, frName, wall } from "./dicos-mission";
import { stationKey } from "./model";

// Planificateur de tâches PMR (15 oct. 2026, docs/design/CADRAGE-PLANIFICATEUR-PMR.md §7) : dossiers DICOS « à vérifier »
// (`GET /api/reservations/disableds/to-check`) et missions acceptées (`pmr_assists`) → tâches `planner_tasks`, UNE PAR
// BOUT ASSISTÉ (IN = embarquement à la gare de départ du train, OUT = débarquement à son arrivée). Logique PURE et testée,
// source unique : l'extension envoie le dossier réduit (ni client, ni remarques, ni point de rencontre), le serveur
// valide et convertit ici.
//
// Heures : `start` = `end` = heure du TRAIN à la gare assistée (instant UTC). La fenêtre réelle de la prise en charge
// (T−15 → T+5 pour un IN light, correspondances…) est calculée à l'affichage par le moteur du planificateur
// (`lib/planner/`), jamais stockée : une règle changée vaut aussitôt pour toutes les tâches.

export const PMR_TASK_TYPES = ["NV", "MR", "DCO", "CRF", "CRE", "CRP", "AUTRE"] as const;
export type PlannerPmrType = (typeof PMR_TASK_TYPES)[number];
/** Types « fauteuil » (fenêtre de 30 min) ; les autres sont « light » (20 min). */
export const WHEELCHAIR: readonly PlannerPmrType[] = ["CRF", "CRE", "CRP"];

export type DicosStatus = "proposal" | "accepted" | "cancelled";
export type PlannerStatus = "a_attribuer" | "attribuee" | "faite" | "annulee";

/** Tâche PMR telle qu'écrite dans `planner_tasks` par le compte de service (champs DICOS seulement). */
export type DicosTask = {
  source_key: string;
  day: string;
  kind: "pmr_in" | "pmr_out";
  start: string;
  end: string;
  station: string;
  station_key: string;
  other_station: string;
  train: string;
  pmr_type: PlannerPmrType | "";
  pax: number;
  light: boolean;
  dossier: string;
  dicos_status: DicosStatus;
  station_ok: "ok" | "pending";
};

const DOSSIER = /^\d{4}-\d{2}-\d{2}-\d{4}$/;
const JOURNEY_ID = /^[A-Za-z0-9-]{1,36}$/;
const text = (max: number) =>
  z
    .union([z.string(), z.number()])
    .nullish()
    .transform((v) => (v === null || v === undefined ? "" : String(v).trim().slice(0, max)));
const flag = z.boolean().nullish();

const disabled = z
  .object({
    symbol: text(60),
    assistanceType: text(20),
    quantity: z.coerce.number().nullish(),
  })
  .passthrough();

const journey = z
  .object({
    id: text(40),
    trainNumber: text(20),
    departureName: text(120),
    arrivalName: text(120),
    departureUicCode: text(20),
    arrivalUicCode: text(20),
    departureTime: text(40),
    arrivalTime: text(40),
    withDepartureAssistance: flag,
    withArrivalAssistance: flag,
    isDepartureOk: flag,
    isArrivalOk: flag,
    isTrainCancelled: flag,
  })
  .passthrough();

const travel = z
  .object({
    travelDate: text(40),
    disableds: z.array(disabled).max(20).nullish(),
    // Forme brute de DICOS (`traveler.disableds`) acceptée aussi : l'extension la réduit normalement.
    traveler: z
      .object({ disableds: z.array(disabled).max(20).nullish() })
      .passthrough()
      .nullish(),
    journeys: z.array(journey).max(20).nullish(),
  })
  .passthrough();

/** Dossier « à vérifier » tel qu'envoyé par l'extension (≥ 1.9.0). */
export const pendingDossierSchema = z
  .object({
    id: text(40),
    displayId: text(40),
    status: text(30),
    travels: z.array(travel).max(31).nullish(),
  })
  .passthrough();
export type PendingDossier = z.infer<typeof pendingDossierSchema>;

/** Statut d'un dossier « à vérifier » : `Cancelled` → annulé, tout le reste (`Proposal`…) → en attente. */
export function pendingStatus(status: string): DicosStatus {
  return status.trim().toLowerCase() === "cancelled" ? "cancelled" : "proposal";
}

/**
 * Type PMR, nombre et assistance « light » des voyageurs d'un trajet. Type : un fauteuil s'il y en a un (sa fenêtre
 * est la plus longue), sinon le plus nombreux ; nombre = somme des `quantity` (1 à 50) ; light = toutes les
 * assistances « Light » (une seule « Full » suffit à passer en complète).
 */
export function travelers(list: readonly z.infer<typeof disabled>[]): {
  pmr_type: PlannerPmrType | "";
  pax: number;
  light: boolean;
} {
  let pax = 0;
  let best: { type: PlannerPmrType; q: number } | null = null;
  let chair: PlannerPmrType | null = null;
  let full = false;
  for (const d of list) {
    const q = Math.max(1, Math.round(Number(d.quantity) || 1));
    pax += q;
    const type: PlannerPmrType = DICOS_SYMBOL[d.symbol] ?? "AUTRE";
    if (WHEELCHAIR.includes(type) && !chair) chair = type;
    if (!best || q > best.q) best = { type, q };
    if (d.assistanceType.toLowerCase() === "full") full = true;
  }
  const pmr_type = chair ?? best?.type ?? "";
  return {
    pmr_type,
    pax: Math.max(1, Math.min(50, pax || 1)),
    light: !full && !(pmr_type && WHEELCHAIR.includes(pmr_type)),
  };
}

/** Instant UTC + jour de Bruxelles d'une heure DICOS (ISO avec décalage) ; null si absente (« 0001-01-01 »). */
export function trainInstant(iso: string): { day: string; at: string } | null {
  const w = wall(iso);
  if (!isValidDay(w.day) || w.day < "2000-01-01" || !/^\d{2}:\d{2}$/.test(w.time)) return null;
  return { day: w.day, at: brusselsToUtc(w.day, w.time) };
}

const dossierRef = (d: PendingDossier) => [d.displayId, d.id].find((x) => DOSSIER.test(x)) ?? "";

/** Dossier « à vérifier » → tâches (une par bout assisté de chaque train, tous les jours du dossier). */
export function mapPendingDossier(raw: unknown): DicosTask[] {
  const p = pendingDossierSchema.safeParse(raw);
  if (!p.success) return [];
  const d = p.data;
  const dossier = dossierRef(d);
  const status = pendingStatus(d.status);
  const out: DicosTask[] = [];
  for (const t of d.travels ?? []) {
    const who = travelers(t.disableds ?? t.traveler?.disableds ?? []);
    for (const j of t.journeys ?? []) {
      if (!JOURNEY_ID.test(j.id)) continue;
      const train = /^\d{1,6}$/.test(j.trainNumber) ? j.trainNumber : "";
      const dep = frName(j.departureName);
      const arr = frName(j.arrivalName);
      // Train supprimé : la prise en charge n'a plus lieu (DICOS reprogramme un autre train) → signalée annulée.
      const cancelled = status === "cancelled" || j.isTrainCancelled === true;
      const ends: [
        boolean,
        "pmr_in" | "pmr_out",
        string,
        string,
        string,
        boolean | null | undefined,
      ][] = [
        [!!j.withDepartureAssistance, "pmr_in", dep, arr, j.departureTime, j.isDepartureOk],
        [!!j.withArrivalAssistance, "pmr_out", arr, dep, j.arrivalTime, j.isArrivalOk],
      ];
      for (const [assisted, kind, station, other, time, ok] of ends) {
        if (!assisted || !station) continue;
        const at = trainInstant(time);
        if (!at) continue;
        out.push({
          source_key: `${j.id}:${kind === "pmr_in" ? "IN" : "OUT"}`,
          day: at.day,
          kind,
          start: at.at,
          end: at.at,
          station,
          station_key: stationKey(station),
          other_station: other,
          train,
          ...who,
          dossier,
          dicos_status: cancelled ? "cancelled" : "proposal",
          station_ok: ok === true ? "ok" : "pending",
        });
      }
    }
  }
  return out;
}

/** Mission acceptée (`pmr_assists`, une ligne par trajet, clé `j<journeyId>`), champs lus par le planificateur. */
export type AssistForPlanner = {
  id: string;
  dicos_id: string;
  day: string;
  time: string;
  arr_time: string;
  station: string;
  other_station: string;
  in_assist: boolean;
  out_assist: boolean;
  train: string;
  transport: string;
  pmr_type: string;
  pax: number;
  full_pax: number;
  light_pax: number;
  dicos_ref: string;
  status: string;
  in_status: string;
  out_status: string;
};

const asType = (v: string): PlannerPmrType | "" =>
  (PMR_TASK_TYPES as readonly string[]).includes(v) ? (v as PlannerPmrType) : "";

/**
 * Mission acceptée → tâches de ses bouts assistés (même clé `<journeyId>:IN|OUT` que le dossier en attente, pour relier
 * plutôt que recréer). Arrivée avant le départ dans la journée = lendemain (train de nuit). Light : compteurs DICOS
 * (complète = 0 et légère > 0), sinon d'après le type.
 */
export function tasksFromAssist(a: AssistForPlanner): (DicosTask & { cancelled: boolean })[] {
  if (!/^j[A-Za-z0-9-]{1,36}$/.test(a.dicos_id) || !isValidDay(a.day)) return [];
  const journeyId = a.dicos_id.slice(1);
  const type = asType(a.pmr_type);
  const light =
    a.full_pax > 0
      ? false
      : a.light_pax > 0
        ? true
        : !(type && WHEELCHAIR.includes(type)) && type !== "";
  const train = a.transport === "taxi" ? "TAXI" : a.train.slice(0, 20);
  const dossier = DOSSIER.test(a.dicos_ref) ? a.dicos_ref : "";
  const out: (DicosTask & { cancelled: boolean })[] = [];
  const valid = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  const ends: [boolean, "pmr_in" | "pmr_out", string, string, string, string][] = [
    [a.in_assist, "pmr_in", a.station, a.other_station, a.time, a.in_status],
    [a.out_assist, "pmr_out", a.other_station, a.station, a.arr_time, a.out_status],
  ];
  for (const [assisted, kind, station, other, time, endStatus] of ends) {
    if (!assisted || !station || !valid(time)) continue;
    const day = kind === "pmr_out" && valid(a.time) && time < a.time ? nextDay(a.day) : a.day;
    const at = brusselsToUtc(day, time);
    const cancelled = a.status === "annulee" || endStatus === "annulee";
    out.push({
      source_key: `${journeyId}:${kind === "pmr_in" ? "IN" : "OUT"}`,
      day,
      kind,
      start: at,
      end: at,
      station,
      station_key: stationKey(station),
      other_station: other,
      train,
      pmr_type: type,
      pax: Math.max(1, Math.min(50, Math.round(a.pax) || 1)),
      light,
      dossier,
      dicos_status: cancelled ? "cancelled" : "accepted",
      station_ok: "ok",
      cancelled,
    });
  }
  return out;
}

function nextDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Statut d'une tâche après une synchro DICOS. L'attribution déjà faite n'est JAMAIS retirée : une annulation passe la
 * tâche en « annulée » en gardant l'agent (on voit le trou) ; une tâche rétablie redevient « attribuée » si une
 * destination est posée, sinon « à attribuer » ; « faite » reste « faite ».
 */
export function nextPlannerStatus(
  current: PlannerStatus | "",
  cancelled: boolean,
  assigned: boolean,
): PlannerStatus {
  if (cancelled) return current === "faite" ? "faite" : "annulee";
  if (current === "faite") return "faite";
  return assigned ? "attribuee" : "a_attribuer";
}
