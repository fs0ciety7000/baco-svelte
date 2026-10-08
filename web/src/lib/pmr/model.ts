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

// IN / OUT (convention SNCB) : un DÉPART est un embarquement (le voyageur monte → IN), une ARRIVÉE un débarquement
// (le voyageur descend → OUT). Source : retour utilisateur du 8 octobre 2026.
export const DIRECTION_IO: Record<
  string,
  { io: "IN" | "OUT"; label: string; tone: "info" | "ok" }
> = {
  depart: { io: "IN", label: "Embarquement", tone: "info" },
  arrivee: { io: "OUT", label: "Débarquement", tone: "ok" },
};

// --- Libellé « à copier » d'une mission (retour utilisateur du 8 oct. 2026) ------------------------
// Ex. « Embarquement d'une chaise roulante », « Débarquement de trois non-voyants ».
const FR_UNITS = [
  "zéro",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
  "dix-sept",
  "dix-huit",
  "dix-neuf",
];
const FR_TENS: Record<number, string> = {
  20: "vingt",
  30: "trente",
  40: "quarante",
  50: "cinquante",
};

/** Nombre en toutes lettres (1 à 50 ; `fem` pour « une », « vingt et une »). */
export function numberFr(n: number, fem = false): string {
  const x = Math.max(0, Math.min(50, Math.round(n)));
  if (x === 1) return fem ? "une" : "un";
  if (x < 20) return FR_UNITS[x] ?? String(x);
  const t = Math.floor(x / 10) * 10;
  const u = x % 10;
  const base = FR_TENS[t] ?? String(x);
  if (u === 0) return base;
  if (u === 1) return `${base} et ${fem ? "une" : "un"}`;
  return `${base}-${FR_UNITS[u]}`;
}

/** Nom PMR accordé (féminin/masculin, singulier/pluriel) à partir du code type. */
function pmrNoun(type: string, plural: boolean): { fem: boolean; word: string } {
  switch (type) {
    case "NV":
      return { fem: false, word: plural ? "non-voyants" : "non-voyant" };
    case "CRE":
    case "CRF":
    case "CRP":
      return { fem: true, word: plural ? "chaises roulantes" : "chaise roulante" };
    case "MR":
      return {
        fem: true,
        word: plural ? "personnes à mobilité réduite" : "personne à mobilité réduite",
      };
    default:
      return { fem: false, word: plural ? "voyageurs PMR" : "voyageur PMR" };
  }
}

/** Phrase à copier : « Embarquement/Débarquement de <nombre> <type accordé> ». */
export function assistCopyText(a: { direction: string; pax: number; pmrType: string }): string {
  const verb = a.direction === "arrivee" ? "Débarquement" : "Embarquement";
  const n = Math.max(1, a.pax || 1);
  const { fem, word } = pmrNoun(a.pmrType, n > 1);
  const count = numberFr(n, fem);
  // Élision « de » → « d' » devant un/une/onze (« d'une chaise roulante »).
  const de = /^(une?|onze)$/.test(count) ? "d'" : "de ";
  return `${verb} ${de}${count} ${word}`;
}

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
  .regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "Heure au format HH:MM")
  .default("");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");
const id = z
  .string()
  .regex(/^$|^[a-z0-9-]{15,36}$/)
  .default("");

// Texte sur une ligne : caractères de contrôle retirés (CSV, affichage).
const line = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, " ").trim())
    .pipe(z.string().max(max))
    .default("");

export const assistSchema = z.object({
  day,
  time,
  direction: z.enum(["arrivee", "depart", ""]).default(""),
  train: line(20),
  station: line(100).pipe(z.string().min(1, "Gare manquante")),
  zone: id,
  dicos_ref: z
    .string()
    .trim()
    .regex(/^$|^\d{4}-\d{2}-\d{2}-\d{4}$/, "Réf. DICOS au format 1234-56-78-9012")
    .default(""),
  pax: z.coerce.number().int().min(1).max(50).default(1),
  pmr_type: z.enum(PMR_TYPE_CODES).or(z.literal("")).default(""),
  client: id,
  note: line(1000),
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
