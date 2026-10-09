import { z } from "zod";

// Horaires ATMS (demande du 9 oct. 2026) : l'extension lit `GET /api/v1/trains/{n°}/{AAAA-MM-JJ}` dans un onglet ATMS
// connecté et envoie l'itinéraire ; on en tire, pour chaque point, le temps d'arrêt PRÉVU (départ − arrivée planifiés).
// Les points sont identifiés par leur abréviation PtCar (`ptcarSymbolicName`, ex. FCR = Charleroi-Central), résolue en
// nom français par le référentiel PtCar au moment du calcul ALEA. Pur et testé.

const point = z.object({
  ptcarSymbolicName: z.string().max(20).optional().default(""),
  ptcarName: z.string().max(80).optional().default(""),
  orderNumber: z.coerce.number().optional().default(0),
  operationCode: z.string().max(4).nullish(),
  plannedFullArrivalTime: z.string().max(40).nullish(),
  plannedFullDepartureTime: z.string().max(40).nullish(),
  isCommercial: z.boolean().nullish(),
});
export const atmsTrainSchema = z.object({
  trains: z
    .array(
      z.object({
        trainNumber: z.coerce.number().optional(),
        label: z.string().max(20).nullish(),
        departureDay: z.string().max(10).nullish(),
      }),
    )
    .max(5)
    .optional()
    .default([]),
  itineraryPoints: z.array(point).max(600),
});

export type AtmsStop = {
  /** Abréviation PtCar (FCR) et nom ATMS abrégé (CHARL-CENTR). */
  abbr: string;
  name: string;
  arr: string; // HH:MM, vide si aucune
  dep: string;
  /** Temps d'arrêt prévu en secondes (0 si passage ou extrémité). */
  dwell: number;
  position: "origin" | "stop" | "terminus";
};

const wall = (iso: string | null | undefined) => {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(iso ?? "");
  return m ? { ms: Date.parse(`${m[1]}T${m[2]}:${m[3]}:00Z`), hhmm: `${m[2]}:${m[3]}` } : null;
};

/** Itinéraire ATMS → arrêts planifiés (temps d'arrêt = départ − arrivée prévus, en heure locale « murale »). */
export function mapAtmsTrain(raw: unknown): { label: string; stops: AtmsStop[] } {
  const d = atmsTrainSchema.parse(raw);
  const pts = [...d.itineraryPoints].sort((a, b) => a.orderNumber - b.orderNumber);
  const stops = pts.map((p, i): AtmsStop => {
    const a = wall(p.plannedFullArrivalTime);
    const dp = wall(p.plannedFullDepartureTime);
    return {
      abbr: p.ptcarSymbolicName.trim().toUpperCase(),
      name: p.ptcarName.trim(),
      arr: a?.hhmm ?? "",
      dep: dp?.hhmm ?? "",
      dwell: a && dp ? Math.max(0, Math.round((dp.ms - a.ms) / 1000)) : 0,
      position: i === 0 ? "origin" : i === pts.length - 1 ? "terminus" : "stop",
    };
  });
  return { label: d.trains[0]?.label ?? "", stops };
}
