import { z } from "zod";

// Domaine PMR partagé client / serveur (miroir d'affichage de pocketbase/pb_hooks/lib/pmr.js, qui fait foi).

export const ASSIST_STATUSES = ["prevue", "realisee", "annulee", "absent"] as const;
export type AssistStatus = (typeof ASSIST_STATUSES)[number];

export const ASSIST_STATUS: Record<
  AssistStatus,
  { label: string; tone: "info" | "ok" | "danger" | "warn" }
> = {
  prevue: { label: "Prévue", tone: "info" },
  realisee: { label: "Réalisée", tone: "ok" },
  annulee: { label: "Annulée", tone: "danger" },
  absent: { label: "Client absent", tone: "warn" },
};

const ASSIST_TRANSITIONS: Record<AssistStatus, AssistStatus[]> = {
  prevue: ["realisee", "annulee", "absent"],
  realisee: ["prevue"],
  annulee: ["prevue"],
  absent: ["prevue"],
};
export function assistTransitions(status: AssistStatus) {
  return ASSIST_TRANSITIONS[status].map((to) => ({
    to,
    label:
      to === "prevue"
        ? "Rétablir"
        : to === "realisee"
          ? "Marquer réalisée"
          : to === "annulee"
            ? "Annuler"
            : "Client absent",
    needsReason: to === "annulee" || to === "absent",
  }));
}

export const PMR_TYPE_CODES = ["NV", "CRF", "CRE", "CRP", "MR", "AUTRE"] as const;
export const PMR_TYPE_LABEL: Record<string, string> = {
  NV: "Non-voyant",
  CRF: "Chaise roulante fixe",
  CRE: "Chaise électrique",
  CRP: "Chaise pliable",
  MR: "Marche difficile",
  AUTRE: "Autre",
};

export const DIRECTION_LABEL: Record<string, string> = { arrivee: "Arrivée", depart: "Départ" };

export const EQUIPMENT_STATES = ["ok", "hs", "en_attente"] as const;
export type EquipmentState = (typeof EQUIPMENT_STATES)[number];
export const EQUIPMENT_STATE: Record<
  EquipmentState,
  { label: string; tone: "ok" | "danger" | "warn" }
> = {
  ok: { label: "En service", tone: "ok" },
  hs: { label: "Hors service", tone: "danger" },
  en_attente: { label: "En attente", tone: "warn" },
};
export const ASSISTANCE_LABEL: Record<string, string> = {
  "3h": "3 h",
  full: "Full",
  light: "Light",
  taxi: "Taxi",
};

/** Validité : dépassée, bientôt (60 jours), ou correcte. */
export function expiry(validUntil: string, today: string): "expired" | "soon" | "ok" | "unknown" {
  if (!validUntil) return "unknown";
  if (validUntil < today) return "expired";
  const soon = new Date(`${today}T12:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 60);
  return validUntil <= soon.toISOString().slice(0, 10) ? "soon" : "ok";
}

const time = z
  .string()
  .regex(/^$|^\d{2}:\d{2}$/, "Heure au format HH:MM")
  .default("");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");
const id = z
  .string()
  .regex(/^$|^[a-z0-9-]{15,36}$/)
  .default("");

export const assistSchema = z.object({
  day,
  time,
  direction: z.enum(["arrivee", "depart", ""]).default(""),
  train: z.string().trim().max(20).default(""),
  station: z.string().trim().max(100).default(""),
  zone: id,
  dicos_ref: z
    .string()
    .trim()
    .regex(/^$|^\d{4}-\d{2}-\d{2}-\d{4}$/, "Réf. DICOS au format 1234-56-78-9012")
    .default(""),
  pax: z.coerce.number().int().min(1).max(50).default(1),
  pmr_type: z.enum(PMR_TYPE_CODES).or(z.literal("")).default(""),
  client: id,
  note: z.string().trim().max(1000).default(""),
});
export type AssistInput = z.infer<typeof assistSchema>;

export const clientSchema = z.object({
  last_name: z.string().trim().min(1, "Nom manquant").max(200),
  first_name: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(100).default(""),
  type: z.enum(PMR_TYPE_CODES).or(z.literal("")).default(""),
  type_detail: z.string().trim().max(200).default(""),
  notes: z.string().trim().max(4000).default(""),
});
export type ClientInput = z.infer<typeof clientSchema>;

export const equipmentSchema = z.object({
  station: z.string().trim().min(1, "Gare manquante").max(100),
  platform: z.string().trim().max(50).default(""),
  zone: id,
  assistance: z.enum(["3h", "full", "light", "taxi", ""]).default(""),
  ramp_type: z.string().trim().max(100).default(""),
  ramp_id: z.string().trim().max(50).default(""),
  state: z.enum(EQUIPMENT_STATES).default("ok"),
  repair_requested: z.boolean().default(false),
  padlock: z.string().trim().max(100).default(""),
  valid_until: z
    .string()
    .regex(/^$|^\d{4}-\d{2}-\d{2}$/)
    .default(""),
  ramp_note: z.string().trim().max(2000).default(""),
  station_restrictions: z.string().trim().max(2000).default(""),
  station_info: z.string().trim().max(2000).default(""),
});
export type EquipmentInput = z.infer<typeof equipmentSchema>;

/** Téléphone : chiffres et « + » seulement (liens etrali: / tel:). */
export function dialable(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}
