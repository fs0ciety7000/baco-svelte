import { z } from "zod";

import { PMR_TYPE_CODES } from "./model";

// Correspondance mission DICOS → prestation CSM (Missions PMR). Logique PURE et testée : l'extension envoie la mission
// DICOS brute (liste fusionnée avec son détail), le serveur la valide et la mappe ici (source unique de vérité).
// Aucune donnée personnelle n'est codée en dur ; les exemples de la doc sont fictifs.

type PmrType = (typeof PMR_TYPE_CODES)[number];

/** Codes d'assistance DICOS connus → type PMR CSM. Complété au fil des imports ; tout code inconnu → « AUTRE ». */
export const DICOS_TYPE: Record<string, PmrType> = {
  "pmr-bp": "NV", // blind-person
  "pmr-ew": "CRE", // electric-wheelchair
  "pmr-mw": "CRF", // manual-wheelchair (hypothèse, à confirmer)
  "pmr-fw": "CRP", // folding-wheelchair (hypothèse)
  "pmr-rm": "MR", // reduced-mobility (hypothèse)
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
function dayOf(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}T/.test(iso) ? iso.slice(0, 10) : "";
}
function timeOf(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso) ? iso.slice(11, 16) : "";
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
    let pax = full + light;
    let best: { type: PmrType; q: number } | null = null;
    for (const item of d) {
      const q = n(item.quantity) || 1;
      pax += q;
      const type = DICOS_TYPE[str(item.typeId)] ?? "AUTRE";
      if (!best || q > best.q) best = { type, q };
    }
    return { type: best?.type ?? (full + light > 0 ? "MR" : ""), pax: clampPax(pax) };
  }
  const count = n(d) + full + light;
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
  const assist: MappedAssist = {
    dicos_id: m.id,
    day: dayOf(str(m.journey.time)),
    time: timeOf(str(m.journey.time)),
    station: frName(m.journey.stationName),
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
  return m.success ? dayOf(str(m.data.journey.time)) : "";
}
