import { z } from "zod";

// Schémas partagés client / serveur des commandes. Le brouillon accepte une saisie incomplète
// (enregistrement automatique) ; `checkBusForSend` / `checkTaxiForSend` listent ce qui manque pour l'envoi.

const text = (max: number) => z.string().trim().max(max).default("");
const time = z
  .string()
  .regex(/^$|^\d{2}:\d{2}$/, "Heure au format HH:MM")
  .default("");
const day = z
  .string()
  .regex(/^$|^\d{4}-\d{2}-\d{2}$/, "Date invalide")
  .default("");
const id = z
  .string()
  .regex(/^$|^[a-z0-9-]{15,36}$/, "Identifiant invalide")
  .default("");
const count = (max: number) => z.coerce.number().int().min(0).max(max).default(0);

export const DISTRICTS = ["Sud-Ouest", "Sud-Est", "Centre"] as const;
export const districtSchema = z.enum(DISTRICTS).or(z.literal("")).default("");

export const C3_TYPES = [
  { value: 2, label: "Remplacement" },
  { value: 1, label: "Évacuation" },
  { value: 3, label: "Modif. service planifié" },
] as const;

export const busSchema = z.object({
  plate: text(40),
  planned: time,
  confirmed: time,
  demob: time,
  /** Bus annulé (ex-« démob. annulation ») : masqué de la B201. */
  cancelled: z.boolean().default(false),
  driver: id,
  specific_route: z.boolean().default(false),
  origin: text(200),
  destination: text(200),
});
export type BusLine = z.infer<typeof busSchema>;

export const emptyBus = (planned = ""): BusLine => busSchema.parse({ planned });

export const busDraftSchema = z.object({
  c3_type: z.coerce.number().int().min(1).max(3).default(2),
  reason: text(2000),
  order_date: day,
  call_time: time,
  relation: text(200),
  origin: text(200),
  destination: text(200),
  direct: z.boolean().default(false),
  round_trip: z.boolean().default(false),
  lines: z.array(z.string().trim().max(50)).max(50).default([]),
  stops: z.array(z.string().trim().max(200)).max(200).default([]),
  stops_mode: z.enum(["auto", "manuel"]).default("auto"),
  stops_manual: text(5000),
  company: id,
  bus_capacity: count(500).default(80),
  passengers: count(100000),
  pmr_count: count(1000),
  buses: z.array(busSchema).min(1).max(50).default([emptyBus()]),
  district: districtSchema,
  notes: text(4000),
});
export type BusDraft = z.infer<typeof busDraftSchema>;

export const BILLING = [
  "SNCB",
  "Infrabel",
  "Tiers",
  "B-CS 1 Accompagnement",
  "B-TO 1 Conduite",
  "B-TC Matériel",
  "B-PT 5 EMMA",
  "B-CS 4 Planification",
] as const;

export const PMR_CAUSES = [
  "Pas de personnel pour la prise en charge",
  "Gare taxi (17 gares)",
  "Travaux Infrabel planifiés",
  "Travaux B-ST planifiés",
  "Défaut infrastructure gare B-ST",
  "Défaut Infrabel",
  "Défaut rampes mobiles B-PT2",
  "Problème lors du voyage PMR",
  "Acte commercial suite erreur SNCB",
  "Acte commercial suite erreur client",
] as const;

export const PMR_TYPES = [
  { value: "NV", label: "Non-voyant" },
  { value: "CRF", label: "Chaise roulante fixe" },
  { value: "CRE", label: "Chaise électrique" },
  { value: "CRP", label: "Chaise pliable" },
  { value: "MR", label: "Marche difficile" },
] as const;

export const taxiDraftSchema = z.object({
  trip_day: day,
  trip_time: time,
  round_trip: z.boolean().default(false),
  return_day: day,
  return_time: time,
  from_station: text(200),
  to_station: text(200),
  via_station: text(200),
  return_from: text(200),
  return_to: text(200),
  taxi_company: id,
  /** Adresse saisie à la main si la société n'en a pas. */
  taxi_email: text(500),
  is_pmr: z.boolean().default(false),
  pmr_client: id,
  pmr_type: text(20),
  pmr_count: count(50),
  passengers: count(100).default(1),
  vehicles: count(20).default(1),
  passenger_name: text(200),
  relation_number: text(100),
  billing: text(200).default("SNCB"),
  reason: text(2000),
  pmr_reason: text(2000),
  confirmed_time: time,
  district: districtSchema,
  notes: text(4000),
});
export type TaxiDraft = z.infer<typeof taxiDraftSchema>;

export type Missing = { field: string; message: string };

/** Contrôles avant envoi d'un bon bus (le serveur les refait). */
export function checkBusForSend(d: BusDraft, opts: { companyEmail: string }): Missing[] {
  const m: Missing[] = [];
  if (!d.reason) m.push({ field: "reason", message: "Motif manquant" });
  if (!d.order_date) m.push({ field: "order_date", message: "Date de circulation manquante" });
  if (!d.origin) m.push({ field: "origin", message: "Origine manquante" });
  if (!d.destination) m.push({ field: "destination", message: "Destination manquante" });
  if (d.origin && d.origin.toLowerCase() === d.destination.toLowerCase())
    m.push({ field: "destination", message: "Destination identique à l'origine" });
  if (!d.company) m.push({ field: "company", message: "Société manquante" });
  else if (!opts.companyEmail)
    m.push({ field: "company", message: "La société n'a pas d'adresse e-mail" });
  if (d.buses.filter((b) => !b.cancelled).length === 0)
    m.push({ field: "buses", message: "Aucun bus actif" });
  return m;
}

/** Contrôles avant envoi d'un bon taxi. */
export function checkTaxiForSend(d: TaxiDraft, opts: { companyEmail: string }): Missing[] {
  const m: Missing[] = [];
  if (!d.trip_day || !d.trip_time) m.push({ field: "trip", message: "Date et heure manquantes" });
  if (!d.from_station) m.push({ field: "from_station", message: "Départ manquant" });
  if (!d.to_station) m.push({ field: "to_station", message: "Arrivée manquante" });
  if (d.from_station && d.from_station.toLowerCase() === d.to_station.toLowerCase())
    m.push({ field: "to_station", message: "Arrivée identique au départ" });
  if (!d.taxi_company && !d.taxi_email)
    m.push({ field: "taxi_company", message: "Société manquante" });
  else if (!opts.companyEmail && !d.taxi_email)
    m.push({ field: "taxi_email", message: "Aucune adresse e-mail pour le taxi" });
  if (d.round_trip) {
    if (!d.return_day || !d.return_time)
      m.push({ field: "return", message: "Date et heure du retour manquantes" });
    else if (`${d.return_day}T${d.return_time}` <= `${d.trip_day}T${d.trip_time}`)
      m.push({ field: "return", message: "Le retour doit suivre l'aller" });
  }
  if (d.is_pmr) {
    if (d.pmr_count < 1) m.push({ field: "pmr_count", message: "Au moins 1 PMR" });
    if (!d.pmr_reason) m.push({ field: "pmr_reason", message: "Cause PMR manquante" });
    if (!d.pmr_client) m.push({ field: "pmr_client", message: "Client PMR à lier" });
  }
  return m;
}

/** Adresses e-mail d'un champ libre (« a@x.be; b@y.be ») ; ignore ce qui n'est pas une adresse. */
export function parseEmails(raw: string | string[]): string[] {
  const list = (Array.isArray(raw) ? raw.join(";") : raw).split(/[;,\s]+/);
  const ok = list.map((s) => s.trim()).filter((s) => /^[^@\s<>"]+@[^@\s<>"]+\.[a-z]{2,}$/i.test(s));
  return [...new Set(ok)];
}
