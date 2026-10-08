import { z } from "zod";

import { districtForStation } from "./districts";
import { PMR_TYPE_CODES } from "./model";

// Correspondance mission DICOS → prestation CSM (Missions PMR). Logique PURE et testée : l'extension envoie la mission
// DICOS brute (liste fusionnée avec son détail), le serveur la valide et la mappe ici (source unique de vérité).
// Aucune donnée personnelle n'est codée en dur ; les exemples de la doc sont fictifs.

type PmrType = (typeof PMR_TYPE_CODES)[number];

// Codes d'assistance DICOS connus → type PMR CSM. On mappe d'abord par `symbol` (plus stable que `typeId`), repli
// sur `typeId`, puis « AUTRE ». Confirmés sur données réelles le 8 oct. 2026.
export const DICOS_SYMBOL: Record<string, PmrType> = {
  "blind-person": "NV",
  "electric-wheelchair": "CRE",
  "fixed-wheelchair": "CRF",
  "manual-wheelchair": "CRF",
  "folding-wheelchair": "CRP",
  "reduced-mobility": "MR",
  "orientation-problems": "DCO",
};
export const DICOS_TYPE: Record<string, PmrType> = {
  "pmr-bp": "NV", // blind-person
  "pmr-ew": "CRE", // electric-wheelchair
  "pmr-wc": "CRF", // fixed-wheelchair
  "pmr-mw": "CRF", // manual-wheelchair
  "pmr-fw": "CRP", // folding-wheelchair
  "pmr-rm": "MR", // reduced-mobility
  "pmr-lm": "MR", // reduced-mobility (trip-details, assistance « Light »)
  "pmr-to": "DCO", // orientation-problems : difficultés de compréhension/orientation
};

/** Statut DICOS → statut CSM. `clientStatus = Absent` l'emporte (voir mapMission). */
export const DICOS_STATUS: Record<string, "prevue" | "realisee" | "annulee" | "absent"> = {
  New: "prevue",
  Assigned: "prevue",
  Started: "prevue",
  Completed: "realisee",
  Deleted: "annulee",
  Suspended: "annulee",
};

/** Partie française d'un nom de gare DICOS (« LIÈGE-GUILLEMINS / LUIK-GUILLEMINS » → « LIÈGE-GUILLEMINS »). */
export function frName(name: unknown): string {
  return typeof name === "string" ? (name.split(" / ")[0] ?? "").trim() : "";
}

/** Libellé multilingue DICOS → texte français (repli : 1re langue non vide). */
export function frText(list: unknown): string {
  if (!Array.isArray(list)) return "";
  const fr = list.find(
    (x) => x && typeof x === "object" && (x as { language?: string }).language === "French",
  );
  const pick = (fr ?? list.find((x) => x && typeof x === "object")) as
    { text?: string } | undefined;
  return typeof pick?.text === "string" ? pick.text.trim() : "";
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// L'heure DICOS est déjà locale (« 2026-10-08T18:41:00+02:00 ») : on lit le mur d'horloge, pas d'instant UTC.
// Garde défensive : si DICOS renvoyait un jour un offset UTC (`Z`/`+00:00`), on convertit en Europe/Brussels pour ne
// pas décaler d'un jour/heure les missions de fin de soirée.
export function wall(iso: unknown): { day: string; time: string } {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso))
    return { day: "", time: "" };
  if (!/(Z|[+-]00:00)$/.test(iso)) return { day: iso.slice(0, 10), time: iso.slice(11, 16) };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: iso.slice(0, 10), time: iso.slice(11, 16) };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("fr-BE", {
      timeZone: "Europe/Brussels",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

// Schéma d'entrée tolérant : on ne valide que ce qu'on lit, le reste est ignoré.
const disabled = z.object({
  typeId: z.string().optional(),
  quantity: z.coerce.number().optional(),
  symbol: z.string().optional(),
});
const person = z
  .object({
    name: z.string().optional(),
    employeeId: z.string().optional(),
    phoneNumber: z.string().nullish(),
  })
  .optional()
  .nullable();
export const missionSchema = z.object({
  id: z.string().min(1),
  missionType: z.string().optional().default(""),
  reservationType: z.string().optional().default(""),
  status: z.string().optional().default(""),
  clientStatus: z.string().optional().default(""),
  reservationId: z.string().optional().default(""),
  reservationDisplayId: z.string().optional().default(""),
  owner: z.object({ name: z.string().optional() }).nullish(),
  journey: z
    .object({
      trainNumber: z.coerce.number().optional(),
      transportId: z.string().optional(),
      time: z.string().optional().default(""),
      stationName: z.string().optional().default(""),
      otherStationName: z.string().optional().default(""),
      coachNumber: z.string().nullish(),
      doorNumber: z.string().nullish(),
    })
    .partial()
    .default({}),
  traveler: z
    .object({
      disableds: z.union([z.array(disabled), z.coerce.number()]).optional(),
      fullAssistances: z.coerce.number().optional(),
      lightAssistances: z.coerce.number().optional(),
    })
    .partial()
    .default({}),
  client: z
    .object({
      firstName: z.string().nullish(),
      lastName: z.string().nullish(),
      phoneNumber: z.string().nullish(),
      email: z.string().nullish(),
      language: z.string().nullish(),
      description: z.string().nullish(),
    })
    .nullish(),
  trainManager: person,
  driver: person,
  meetingPoint: z
    .array(z.object({ language: z.string().optional(), text: z.string().optional() }))
    .optional(),
});
export type MissionInput = z.infer<typeof missionSchema>;

const clampPax = (v: number) => Math.max(1, Math.min(50, Math.round(v) || 1));

/** Type PMR majoritaire + total voyageurs assistés, depuis le détail (`disableds[]`) ou la liste (compteurs). */
export function travelerSummary(traveler: MissionInput["traveler"]): {
  type: PmrType | "";
  pax: number;
} {
  const d = traveler.disableds;
  const full = n(traveler.fullAssistances);
  const light = n(traveler.lightAssistances);
  if (Array.isArray(d)) {
    // Les compteurs full/light et la liste `disableds` décrivent les MÊMES personnes (une PMR « Light » figure dans
    // les deux) : on prend le plus grand des deux, jamais la somme (bug « 2 × MR » pour une voyageuse seule).
    let listed = 0;
    let best: { type: PmrType; q: number } | null = null;
    for (const item of d) {
      const q = n(item.quantity) || 1;
      listed += q;
      const type = DICOS_SYMBOL[str(item.symbol)] ?? DICOS_TYPE[str(item.typeId)] ?? "AUTRE";
      if (!best || q > best.q) best = { type, q };
    }
    return {
      type: best?.type ?? (full + light > 0 ? "MR" : ""),
      pax: clampPax(Math.max(listed, full + light)),
    };
  }
  const count = Math.max(n(d), full + light);
  // Liste sans détail : pas de code de type, seulement le nombre.
  return { type: full + light > 0 && n(d) === 0 ? "MR" : "", pax: clampPax(count) };
}

export function mapStatus(
  status: string,
  clientStatus: string,
): "prevue" | "realisee" | "annulee" | "absent" {
  if (clientStatus === "Absent") return "absent";
  return DICOS_STATUS[status] ?? "prevue";
}

export type MappedAssist = {
  dicos_id: string;
  day: string;
  time: string;
  station: string;
  other_station: string;
  district: "DCE" | "DSE" | "DSO" | "";
  direction: "arrivee" | "depart" | "";
  mission_type: string;
  train: string;
  dicos_ref: string;
  pax: number;
  pmr_type: PmrType | "";
  status: "prevue" | "realisee" | "annulee" | "absent";
  source: "dicos";
};
export type MappedMission = {
  reservation_type: string;
  raw_status: string;
  client_first: string;
  client_last: string;
  client_phone: string;
  client_email: string;
  client_lang: string;
  client_desc: string;
  train_manager_name: string;
  train_manager_phone: string;
  driver_name: string;
  driver_phone: string;
  meeting_point: string;
  coach: string;
  door: string;
  owner_name: string;
};

/** Mission DICOS brute (liste + détail fusionnés) → { base non nominative, détail nominatif }. */
export function mapMission(raw: unknown): { assist: MappedAssist; mission: MappedMission } {
  const m = missionSchema.parse(raw);
  const { type, pax } = travelerSummary(m.traveler);
  const dir =
    m.missionType === "Departure" ? "depart" : m.missionType === "Arrival" ? "arrivee" : "";
  const ref = m.reservationDisplayId || m.reservationId || "";
  const w = wall(m.journey.time);
  const station = frName(m.journey.stationName);
  const otherStation = frName(m.journey.otherStationName);
  const assist: MappedAssist = {
    dicos_id: m.id,
    day: w.day,
    time: w.time,
    station,
    other_station: otherStation,
    // District déduit de la gare d'assistance, repli sur l'autre extrémité (ex. gare hors région).
    district: districtForStation(station) || districtForStation(otherStation) || "",
    direction: dir,
    mission_type: m.missionType || "",
    train: m.journey.transportId || (m.journey.trainNumber ? String(m.journey.trainNumber) : ""),
    dicos_ref: /^\d{4}-\d{2}-\d{2}-\d{4}$/.test(ref) ? ref : "",
    pax,
    pmr_type: type,
    status: mapStatus(m.status, m.clientStatus),
    source: "dicos",
  };
  const mission: MappedMission = {
    reservation_type: m.reservationType || "",
    raw_status: m.status || "",
    client_first: str(m.client?.firstName).slice(0, 200),
    client_last: str(m.client?.lastName).slice(0, 200),
    client_phone: str(m.client?.phoneNumber).slice(0, 100),
    client_email: str(m.client?.email).slice(0, 200),
    client_lang: str(m.client?.language).slice(0, 40),
    client_desc: str(m.client?.description).slice(0, 500),
    train_manager_name: str(m.trainManager?.name).slice(0, 200),
    train_manager_phone: str(m.trainManager?.phoneNumber).slice(0, 100),
    driver_name: str(m.driver?.name).slice(0, 200),
    driver_phone: str(m.driver?.phoneNumber).slice(0, 100),
    meeting_point: frText(m.meetingPoint).slice(0, 300),
    coach: str(m.journey.coachNumber).slice(0, 20),
    door: str(m.journey.doorNumber).slice(0, 20),
    owner_name: str(m.owner?.name).slice(0, 200),
  };
  return { assist, mission };
}

/** Jour de service d'une mission (Europe/Brussels), pour filtrer l'ingestion par jour. */
export function missionDay(raw: unknown): string {
  const m = missionSchema.safeParse(raw);
  return m.success ? wall(m.data.journey.time).day : "";
}

// ---------------------------------------------------------------------------------------------------
// Missions PMR v3 : dossier complet DICOS (`GET /trip-details/{dossier}/{type}`) → une ligne par TRAJET (leg).
// Chaque trajet porte la gare + l'heure de départ ET d'arrivée, l'assistance à l'embarquement (IN) et/ou au
// débarquement (OUT), le transport (train / taxi). Le client et la description sont communs au dossier.

const journeySchema = z
  .object({
    id: z.coerce.string(),
    departureTime: z.string().nullish(),
    departureName: z.string().nullish(),
    arrivalTime: z.string().nullish(),
    arrivalName: z.string().nullish(),
    withDepartureAssistance: z.boolean().nullish(),
    withArrivalAssistance: z.boolean().nullish(),
    isTrainCancelled: z.boolean().nullish(),
    isDepartureCancelled: z.boolean().nullish(),
    isArrivalCancelled: z.boolean().nullish(),
    trainNumber: z.coerce.number().nullish(),
    transportId: z.string().nullish(),
    transportType: z.string().nullish(),
    coachNumber: z.string().nullish(),
    doorNumber: z.string().nullish(),
  })
  .passthrough();

const dossierSchema = z
  .object({
    id: z.string().nullish(),
    displayId: z.string().nullish(),
    type: z.string().nullish(),
    status: z.string().nullish(),
    missions: z
      .array(
        z
          .object({
            journeyId: z.coerce.string().nullish(),
            missionType: z.string().nullish(),
            status: z.string().nullish(),
            owner: z.object({ name: z.string().nullish() }).nullish(),
          })
          .passthrough(),
      )
      .default([]),
    travels: z
      .array(
        z
          .object({
            journeys: z.array(journeySchema).default([]),
            meetingPoint: z
              .array(z.object({ language: z.string().optional(), text: z.string().optional() }))
              .nullish(),
            travelDate: z.string().nullish(),
            traveler: z
              .object({
                quantity: z.coerce.number().nullish(),
                disableds: z.array(disabled).nullish(),
              })
              .partial()
              .nullish(),
          })
          .passthrough(),
      )
      .default([]),
    description: z.object({ fr: z.string().nullish(), nl: z.string().nullish() }).nullish(),
    client: z
      .object({
        firstName: z.string().nullish(),
        lastName: z.string().nullish(),
        phoneNumber: z.string().nullish(),
        email: z.string().nullish(),
        language: z.string().nullish(),
        description: z.string().nullish(),
      })
      .nullish(),
  })
  .passthrough();

export type MappedLeg = {
  dicos_id: string; // id du trajet (journey) : clé de dédup
  day: string;
  time: string; // départ
  station: string; // gare de départ
  district: "DCE" | "DSE" | "DSO" | "";
  other_station: string; // gare d'arrivée
  arr_time: string;
  arr_district: "DCE" | "DSE" | "DSO" | "";
  in_assist: boolean; // assistance à l'embarquement (gare de départ)
  out_assist: boolean; // assistance au débarquement (gare d'arrivée)
  transport: "train" | "taxi";
  train: string;
  dicos_ref: string;
  pax: number;
  pmr_type: PmrType | "";
  status: "prevue" | "realisee" | "annulee" | "absent";
  source: "dicos";
};

/** Statut d'un trajet d'après les missions DICOS qui le concernent et les annulations du trajet. */
function legStatus(j: z.infer<typeof journeySchema>, statuses: string[]): MappedLeg["status"] {
  if (j.isTrainCancelled || statuses.some((s) => s === "Deleted" || s === "Suspended"))
    return "annulee";
  if (statuses.length && statuses.every((s) => s === "Completed")) return "realisee";
  return "prevue";
}

/** Dossier DICOS complet → une ligne (leg) par trajet + détail nominatif commun. */
export function mapDossier(raw: unknown): {
  legs: { assist: MappedLeg; mission: MappedMission }[];
} {
  const d = dossierSchema.parse(raw);
  const ref = d.displayId || d.id || "";
  const dossierRef = /^\d{4}-\d{2}-\d{2}-\d{4}$/.test(ref) ? ref : "";
  const owner = d.missions.map((m) => m.owner?.name).find(Boolean) ?? "";
  const legs: { assist: MappedLeg; mission: MappedMission }[] = [];
  for (const t of d.travels) {
    const disableds = t.traveler?.disableds ?? [];
    const { type } = travelerSummary({ disableds });
    const pax = clampPax(
      n(t.traveler?.quantity) || disableds.reduce((s, x) => s + (n(x.quantity) || 1), 0),
    );
    const meeting = frText(t.meetingPoint).slice(0, 300);
    for (const j of t.journeys) {
      const dep = wall(j.departureTime);
      const arr = wall(j.arrivalTime);
      const station = frName(j.departureName);
      const other = frName(j.arrivalName);
      const statuses = d.missions.filter((m) => m.journeyId === j.id).map((m) => str(m.status));
      const isTaxi = str(j.transportType).toLowerCase() === "taxi";
      legs.push({
        assist: {
          dicos_id: j.id,
          day: dep.day || (t.travelDate ?? "").slice(0, 10),
          time: dep.time,
          station,
          district: districtForStation(station),
          other_station: other,
          arr_time: arr.time,
          arr_district: districtForStation(other),
          in_assist: !!j.withDepartureAssistance,
          out_assist: !!j.withArrivalAssistance,
          transport: isTaxi ? "taxi" : "train",
          train: n(j.trainNumber) > 0 ? String(j.trainNumber) : str(j.transportId).slice(0, 20),
          dicos_ref: dossierRef,
          pax,
          pmr_type: type,
          status: legStatus(j, statuses),
          source: "dicos",
        },
        mission: {
          reservation_type: str(d.type),
          raw_status: str(d.status),
          client_first: str(d.client?.firstName).slice(0, 200),
          client_last: str(d.client?.lastName).slice(0, 200),
          client_phone: str(d.client?.phoneNumber).slice(0, 100),
          client_email: str(d.client?.email).slice(0, 200),
          client_lang: str(d.client?.language).slice(0, 40),
          // Description complète du dossier (composition + trajets), utile à l'agent ; nominative → pmr:read.
          client_desc: str(d.description?.fr || d.client?.description).slice(0, 500),
          train_manager_name: "",
          train_manager_phone: "",
          driver_name: isTaxi ? str(j.transportId).slice(0, 200) : "",
          driver_phone: "",
          meeting_point: meeting,
          coach: str(j.coachNumber).slice(0, 20),
          door: str(j.doorNumber).slice(0, 20),
          owner_name: str(owner).slice(0, 200),
        },
      });
    }
  }
  return { legs };
}

// ---------------------------------------------------------------------------------------------------
// Missions PMR v3 bis : une ligne par TRAJET reconstruite depuis la LISTE des missions du jour (+ détail par
// mission), sans l'endpoint trip-details. Chaque mission (Departure / Arrival) porte son trajet : gare et heure de
// la mission (`stationName`/`time`) et de l'autre extrémité (`otherStationName`/`otherTime`), les drapeaux IN/OUT.
// On regroupe par `journey.id` (même identifiant que dans le dossier complet → même ligne `j<id>`).
// Les réservations de GROUPE (écoles…, sans PMR) et les tâches « Stickering » sont écartées (absentes de la vue
// PMR de DICOS : constaté le 9 oct. 2026, 100 lignes CSM contre 78 missions DICOS).

const listJourney = z
  .object({
    id: z.coerce.string().optional(),
    reservationType: z.string().optional(),
    missionType: z.string().optional(),
    status: z.string().optional(),
    journey: z
      .object({
        id: z.coerce.string().nullish(),
        time: z.string().nullish(),
        otherTime: z.string().nullish(),
        withDepartureAssistance: z.boolean().nullish(),
        withArrivalAssistance: z.boolean().nullish(),
        isTrainCancelled: z.boolean().nullish(),
        transportType: z.string().nullish(),
        trainNumber: z.coerce.number().nullish(),
        transportId: z.string().nullish(),
      })
      .passthrough()
      .default({}),
  })
  .passthrough();

/** Heure murale d'une date DICOS, « 0001-01-01 » (valeur vide côté DICOS) → vide. */
const wallOrEmpty = (iso: unknown) =>
  typeof iso === "string" && !iso.startsWith("0001-") ? wall(iso) : { day: "", time: "" };

/** Réservation PMR (et non de groupe), mission d'assistance (et non « Stickering »). */
export function isPmrMission(raw: unknown): boolean {
  const p = listJourney.safeParse(raw);
  if (!p.success) return false;
  const type = p.data.reservationType ?? "";
  const mt = p.data.missionType ?? "";
  return (type === "Disabled" || type === "") && (mt === "Departure" || mt === "Arrival");
}

/** Liste de missions DICOS (détail fusionné si disponible) → une ligne par trajet. */
export function mapMissionList(raws: unknown[]): { assist: MappedLeg; mission: MappedMission }[] {
  type Part = { p: z.infer<typeof listJourney>; m: ReturnType<typeof mapMission> };
  const groups = new Map<string, Part[]>();
  for (const raw of raws) {
    if (!isPmrMission(raw)) continue;
    const p = listJourney.safeParse(raw);
    if (!p.success) continue;
    let m: ReturnType<typeof mapMission>;
    try {
      m = mapMission(raw);
    } catch {
      continue;
    }
    const key = p.data.journey.id || p.data.id || "";
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push({ p: p.data, m });
    groups.set(key, list);
  }
  const first = <T>(xs: T[], ok: (x: T) => boolean = Boolean) => xs.find(ok);
  const out: { assist: MappedLeg; mission: MappedMission }[] = [];
  for (const [key, parts] of groups) {
    const dep = parts.find((x) => x.p.missionType === "Departure");
    const arr = parts.find((x) => x.p.missionType === "Arrival");
    // Depuis une mission de départ : gare de la mission = départ ; depuis une arrivée : gare de la mission = arrivée.
    const depStation = dep ? dep.m.assist.station : (arr?.m.assist.other_station ?? "");
    const arrStation = arr ? arr.m.assist.station : (dep?.m.assist.other_station ?? "");
    const depW = dep ? wallOrEmpty(dep.p.journey.time) : wallOrEmpty(arr?.p.journey.otherTime);
    const arrW = arr ? wallOrEmpty(arr.p.journey.time) : wallOrEmpty(dep?.p.journey.otherTime);
    const j = (dep ?? arr ?? parts[0]!).p.journey;
    const statuses = parts.map((x) => x.p.status ?? "");
    const status: MappedLeg["status"] =
      j.isTrainCancelled || statuses.every((s) => s === "Deleted" || s === "Suspended")
        ? "annulee"
        : parts.some((x) => x.m.assist.status === "absent")
          ? "absent"
          : statuses.every((s) => s === "Completed")
            ? "realisee"
            : "prevue";
    const typed = first(parts, (x) => !!x.m.assist.pmr_type);
    const isTaxi = str(j.transportType).toLowerCase() === "taxi";
    const pick = (k: keyof MappedMission) => first(parts.map((x) => x.m.mission[k])) ?? "";
    const mission = Object.fromEntries(
      (Object.keys(parts[0]!.m.mission) as (keyof MappedMission)[]).map((k) => [k, pick(k)]),
    ) as MappedMission;
    if (isTaxi && !mission.driver_name) mission.driver_name = str(j.transportId).slice(0, 200);
    out.push({
      assist: {
        dicos_id: key,
        day: depW.day || arrW.day || parts[0]!.m.assist.day,
        time: depW.time,
        station: depStation,
        district: districtForStation(depStation),
        other_station: arrStation,
        arr_time: arrW.time,
        arr_district: districtForStation(arrStation),
        in_assist: parts.some((x) => !!x.p.journey.withDepartureAssistance),
        out_assist: parts.some((x) => !!x.p.journey.withArrivalAssistance),
        transport: isTaxi ? "taxi" : "train",
        train: n(j.trainNumber) > 0 ? String(j.trainNumber) : str(j.transportId).slice(0, 20),
        dicos_ref: first(parts.map((x) => x.m.assist.dicos_ref)) ?? "",
        pax: (typed ?? parts[0]!).m.assist.pax,
        pmr_type: typed?.m.assist.pmr_type ?? "",
        status,
        source: "dicos",
      },
      mission,
    });
  }
  return out;
}
