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

export const PMR_TYPE_CODES = ["NV", "CRF", "CRE", "CRP", "MR", "DCO", "AUTRE"] as const;
export const PMR_TYPE_LABEL: Record<string, string> = {
  NV: "Non-voyant",
  CRF: "Chaise roulante fixe",
  CRE: "Chaise électrique",
  CRP: "Chaise pliable",
  MR: "Marche difficile",
  DCO: "Difficultés de compréhension/orientation",
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
    case "DCO":
      return {
        fem: true,
        word: plural
          ? "personnes avec des difficultés d'orientation"
          : "personne avec des difficultés d'orientation",
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

// ---------------------------------------------------------------------------------------------------
// Export ALEA (demande du 9 oct. 2026) : toutes les PMR d'un même train à une même gare, additionnées par sens et
// par type précis (« Embarquement de trois non-voyants », « Débarquement d'une chaise roulante fixe »).

/** Nom précis pour l'ALEA (le type de chaise est détaillé). */
function aleaNoun(type: string, plural: boolean): { fem: boolean; word: string } {
  const chair = (adj: string, adjs: string) => ({
    fem: true,
    word: plural ? `chaises roulantes ${adjs}` : `chaise roulante ${adj}`,
  });
  switch (type) {
    case "CRF":
      return chair("fixe", "fixes");
    case "CRE":
      return chair("électrique", "électriques");
    case "CRP":
      return chair("pliable", "pliables");
    case "MR":
      return { fem: true, word: plural ? "mobilités réduites" : "mobilité réduite" };
    default:
      return pmrNoun(type, plural);
  }
}

export function aleaLine(verb: "Embarquement" | "Débarquement", pax: number, type: string): string {
  const n = Math.max(1, pax || 1);
  const { fem, word } = aleaNoun(type, n > 1);
  const count = numberFr(n, fem);
  const de = /^(une?|onze)$/.test(count) ? "d'" : "de ";
  return `${verb} ${de}${count} ${word}`;
}

/** Un bout d'assistance : gare, heure, sens (IN embarquement / OUT débarquement). */
export type AleaEnd = {
  day: string;
  train: string;
  station: string;
  time: string;
  io: "IN" | "OUT";
  pax: number;
  pmrType: string;
  /** N° de dossier DICOS (vide si inconnu). */
  dossier?: string;
  /** Voyageurs en assistance complète / légère (0 et 0 = inconnu). */
  fullPax?: number;
  lightPax?: number;
};

/** Ce que le logigramme d'encodage ALEA examine pour un bloc (jour · train · gare). */
export type AleaRuleInput =
  | { kind: "pmr"; full: number; light: number; unknown: number }
  | { kind: "group"; children: number; seniors: number; total: number };

export type AleaGroup = {
  key: string;
  day: string;
  train: string;
  station: string;
  time: string;
  io: "IN" | "OUT";
  lines: string[];
  /** Dossiers qui composent le bloc, avec leur nombre de PMR / personnes. */
  dossiers: { ref: string; count: number }[];
  /** Total de PMR (missions PMR) ou de personnes (groupes). */
  total: number;
  unit: "PMR" | "personnes";
  rule: AleaRuleInput;
};

// Un bloc ALEA = un train, un jour, une gare et un SENS (IN = embarquement, OUT = débarquement) : on additionne
// tous les dossiers qui y montent (ou en descendent), par type (précision de l'utilisateur, 9 oct. 2026).
const blockKey = (e: { day: string; train: string; station: string; io: "IN" | "OUT" }) =>
  `${e.day}|${e.train}|${e.station}|${e.io}`;
const byTime = (a: AleaGroup, b: AleaGroup) =>
  a.day.localeCompare(b.day) ||
  (a.time || "99").localeCompare(b.time || "99") ||
  a.station.localeCompare(b.station) ||
  a.io.localeCompare(b.io);

/** Additionne par dossier (composition affichée dans l'en-tête du bloc). */
function addDossier(list: { ref: string; count: number }[], ref: string, count: number) {
  const key = ref || "sans n°";
  const d = list.find((x) => x.ref === key);
  if (d) d.count += count;
  else list.push({ ref: key, count });
}

/** Regroupe par jour + train + gare, additionne par sens et type ; tri par heure. */
export function aleaGroups(ends: AleaEnd[]): AleaGroup[] {
  const groups = new Map<string, { g: AleaGroup; sums: Map<string, number> }>();
  for (const e of ends) {
    const key = blockKey(e);
    let entry = groups.get(key);
    if (!entry) {
      entry = {
        g: {
          key,
          day: e.day,
          train: e.train,
          station: e.station,
          time: e.time,
          io: e.io,
          lines: [],
          dossiers: [],
          total: 0,
          unit: "PMR",
          rule: { kind: "pmr", full: 0, light: 0, unknown: 0 },
        },
        sums: new Map(),
      };
      groups.set(key, entry);
    }
    if (e.time && (!entry.g.time || e.time < entry.g.time)) entry.g.time = e.time;
    const pax = Math.max(1, e.pax || 1);
    const k = `${e.io}|${e.pmrType}`;
    entry.sums.set(k, (entry.sums.get(k) ?? 0) + pax);
    entry.g.total += pax;
    addDossier(entry.g.dossiers, e.dossier ?? "", pax);
    const rule = entry.g.rule as Extract<AleaRuleInput, { kind: "pmr" }>;
    const full = Math.max(0, e.fullPax ?? 0);
    const light = Math.max(0, e.lightPax ?? 0);
    if (full + light === 0) rule.unknown += pax;
    else {
      rule.full += Math.min(full, pax);
      rule.light += Math.min(light, Math.max(0, pax - Math.min(full, pax)));
    }
  }
  const ORDER = ["IN", "OUT"];
  return [...groups.values()]
    .map(({ g, sums }) => ({
      ...g,
      lines: [...sums.entries()]
        .sort(
          ([a], [b]) =>
            ORDER.indexOf(a.split("|")[0]!) - ORDER.indexOf(b.split("|")[0]!) || a.localeCompare(b),
        )
        .map(([k, n]) => {
          const [io, type] = k.split("|") as [string, string];
          return aleaLine(io === "IN" ? "Embarquement" : "Débarquement", n, type);
        }),
    }))
    .sort(byTime);
}

// ---------------------------------------------------------------------------------------------------
// Export ALEA des GROUPES (demande du 9 oct. 2026) : « Embarquement d'un groupe de 53 personnes dont 50 enfants »,
// sans « dont … » s'il n'y a pas d'enfants. Plusieurs groupes au même train, même gare et même sens sont ADDITIONNÉS
// (« Embarquement de 2 groupes, 80 personnes dont 50 enfants »), regroupés par jour + train + gare.

export function aleaGroupLine(
  verb: "Embarquement" | "Débarquement",
  total: number,
  children: number,
  groups = 1,
): string {
  const n = Math.max(1, total || 1);
  const people = n > 1 ? `${n} personnes` : "1 personne";
  const kids = children > 0 ? ` dont ${children} ${children > 1 ? "enfants" : "enfant"}` : "";
  return groups > 1
    ? `${verb} de ${groups} groupes, ${people}${kids}`
    : `${verb} d'un groupe de ${people}${kids}`;
}

export type GroupEnd = {
  day: string;
  train: string;
  station: string;
  time: string;
  io: "IN" | "OUT";
  total: number;
  children: number;
  seniors?: number;
  dossier?: string;
};

export function aleaGroupBlocks(ends: GroupEnd[]): AleaGroup[] {
  type Block = AleaGroup & { sums: Map<string, { n: number; total: number; children: number }> };
  const map = new Map<string, Block>();
  for (const e of ends) {
    const key = blockKey(e);
    const g: Block = map.get(key) ?? {
      key,
      day: e.day,
      train: e.train,
      station: e.station,
      time: e.time,
      io: e.io,
      lines: [],
      dossiers: [],
      total: 0,
      unit: "personnes",
      rule: { kind: "group", children: 0, seniors: 0, total: 0 },
      sums: new Map(),
    };
    if (e.time && (!g.time || e.time < g.time)) g.time = e.time;
    const total = Math.max(1, e.total || 1);
    const sum = g.sums.get(e.io) ?? { n: 0, total: 0, children: 0 };
    sum.n += 1;
    sum.total += total;
    sum.children += Math.max(0, e.children);
    g.sums.set(e.io, sum);
    // Un groupe qui embarque ET débarque à la même gare (rare) n'est compté qu'une fois dans la composition.
    const ref = e.dossier || "sans n°";
    if (!g.dossiers.some((d) => d.ref === ref && ref !== "sans n°")) {
      g.dossiers.push({ ref, count: total });
      g.total += total;
      const rule = g.rule as Extract<AleaRuleInput, { kind: "group" }>;
      rule.total += total;
      rule.children += Math.max(0, e.children);
      rule.seniors += Math.max(0, e.seniors ?? 0);
    }
    map.set(key, g);
  }
  return [...map.values()]
    .map(({ sums, ...g }) => ({
      ...g,
      lines: (["IN", "OUT"] as const)
        .filter((io) => sums.has(io))
        .map((io) => {
          const x = sums.get(io)!;
          return aleaGroupLine(
            io === "IN" ? "Embarquement" : "Débarquement",
            x.total,
            x.children,
            x.n,
          );
        }),
    }))
    .sort(byTime);
}

// ---------------------------------------------------------------------------------------------------
// « Obligatoire » ou non (logigrammes « Encodage des PMR / des groupes dans ALEA », 9 oct. 2026).
// PMR : arrêt prévu ≥ 5 min → ne pas encoder ; sinon PMR complète → encoder ; PMR légère : moins de 4 → ne pas
// encoder, 4 ou plus → nombre × 30 s, encoder seulement si l'arrêt prévu est dépassé.
// Groupes : arrêt prévu ≥ 5 min → ne pas encoder ; sinon ≥ 25 enfants (< 12 ans), ou ≥ 25 seniors (> 65 ans, si
// les âges sont connus), ou ≥ 75 personnes → encoder.

/** Temps d'arrêt prévu du train à la gare (iRail) ; `null` si le train ou la gare n'ont pas été trouvés. */
export type AleaDwell = {
  seconds: number | null;
  position: "stop" | "origin" | "terminus" | "unknown" | "taxi";
};
export type AleaDecision = { status: "obligatoire" | "non" | "verifier"; reason: string };

const mmss = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s ? `${m} min ${String(s).padStart(2, "0")} s` : `${m} min`;
};

export function aleaDecision(rule: AleaRuleInput, dwell: AleaDwell | undefined): AleaDecision {
  if (!dwell) return { status: "verifier", reason: "Temps d'arrêt en cours de lecture…" };
  if (dwell.position === "taxi")
    return { status: "non", reason: "Transport en taxi : pas d'arrêt de train concerné." };
  if (dwell.position === "origin" || dwell.position === "terminus")
    return {
      status: "verifier",
      reason: `Gare ${dwell.position === "origin" ? "d'origine" : "terminus"} du train : pas de temps d'arrêt prévu dans l'horaire.`,
    };
  if (dwell.seconds === null)
    return {
      status: "verifier",
      reason: "Temps d'arrêt inconnu (train ou gare introuvable dans iRail).",
    };
  const stop = `arrêt prévu de ${mmss(dwell.seconds)}`;
  if (dwell.seconds >= 300)
    return { status: "non", reason: `Arrêt prévu de 5 minutes ou plus (${mmss(dwell.seconds)}).` };
  if (rule.kind === "group") {
    const hits = [
      rule.children >= 25 ? `${rule.children} enfants (≥ 25)` : "",
      rule.seniors >= 25 ? `${rule.seniors} seniors (≥ 25)` : "",
      rule.total >= 75 ? `${rule.total} personnes (≥ 75)` : "",
    ].filter(Boolean);
    return hits.length
      ? { status: "obligatoire", reason: `${hits.join(", ")} ; ${stop}.` }
      : {
          status: "non",
          reason: `${rule.total} personnes dont ${rule.children} enfants et ${rule.seniors} seniors : sous les seuils (25 enfants, 25 seniors, 75 personnes).`,
        };
  }
  if (rule.full > 0)
    return { status: "obligatoire", reason: `${rule.full} PMR en assistance complète ; ${stop}.` };
  if (rule.unknown > 0)
    return {
      status: "verifier",
      reason: `Assistance complète ou légère inconnue pour ${rule.unknown} PMR (à resynchroniser depuis DICOS) ; ${stop}.`,
    };
  if (rule.light < 4)
    return { status: "non", reason: `${rule.light} PMR en assistance légère (moins de 4).` };
  const needed = rule.light * 30;
  return needed > dwell.seconds
    ? {
        status: "obligatoire",
        reason: `${rule.light} PMR légères × 30 s = ${mmss(needed)}, plus que l'${stop}.`,
      }
    : {
        status: "non",
        reason: `${rule.light} PMR légères × 30 s = ${mmss(needed)}, l'${stop} n'est pas dépassé.`,
      };
}

/** Rapproche le nom d'une gare DICOS de celui d'iRail (accents, casse, tirets ignorés). */
export function stationKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
