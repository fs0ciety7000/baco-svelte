import { z } from "zod";

import { brusselsToUtc } from "@/lib/orders/time";

// Horaires Quinyx (demande du 14 oct. 2026) : l'extension lit le planning PUBLIÉ d'un groupe Quinyx dans un onglet
// connecté (`/extapi/v1/shifts/by-group/<groupe>`, mêmes cookies que la page) et l'envoie à CSM. Ce fichier est la
// SOURCE UNIQUE du tri et de la conversion (pur, testé) : l'extension trie déjà, le serveur retrie et ne garde que
// les prestations PACO / RCCA / EXTRA affectées à un agent et publiées. Rien d'autre (repos, compensations, visite
// médicale, commentaires, contacts) n'est conservé. Heures Quinyx = heure locale de Bruxelles, sans décalage.

export const QUINYX_DISTRICTS = ["DSO", "DSE", "DCE", "DNO", "DNE"] as const;
export type QuinyxDistrict = (typeof QUINYX_DISTRICTS)[number];

export const SHIFT_KINDS = ["am", "pm", "nuit", "extra", "autre"] as const;
export type QuinyxKind = (typeof SHIFT_KINDS)[number];
export const KIND_LABEL: Record<QuinyxKind, string> = {
  am: "AM",
  pm: "PM",
  nuit: "Nuit",
  extra: "Extra",
  autre: "Autre",
};

/** Lettres majuscules sans accents, tout le reste en espaces simples. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Prestation captée : PACO_…, RCCA_… ou EXTRA… (tout le reste est ignoré, données de santé et repos compris). */
export function isCapturedCode(code: string): boolean {
  const f = fold(code);
  return /^(PACO|RCCA) /.test(f) || /^EXTRA( |$)/.test(f);
}

/** AM / PM / Nuit d'après le code (PACO_AM, RCCA_PM, PACO_N), Extra pour EXTRA… ; sinon d'après l'heure de début. */
export function shiftKind(code: string, start = ""): QuinyxKind {
  const f = ` ${fold(code)} `;
  if (/^ EXTRA /.test(f)) return "extra";
  if (f.includes(" AM ")) return "am";
  if (f.includes(" PM ")) return "pm";
  if (/ (N|NUIT|NIGHT) /.test(f)) return "nuit";
  const h = Number(start.slice(0, 2));
  if (!Number.isFinite(h) || !start) return "autre";
  if (h >= 4 && h < 10) return "am";
  if (h >= 10 && h < 18) return "pm";
  return "nuit";
}

export type Place = { pattern: string; district: string };

// --- Groupes « gares » (planificateur de tâches PMR, 15 oct. 2026) ---

/** Rôle d'un groupe Quinyx : `equipe` (PACO / RCCA, Ressources › Planning) ou `gares` (agents de gare, planificateur). */
export const GROUP_PURPOSES = ["equipe", "gares"] as const;
export type GroupPurpose = (typeof GROUP_PURPOSES)[number];
export const PURPOSE_LABEL: Record<GroupPurpose, string> = { equipe: "Équipe", gares: "Gares" };

export const STATION_POSTS = ["CPI", "SPI", "OPI", "PA", "EXTRA"] as const;
export type StationPost = (typeof STATION_POSTS)[number];

/**
 * Prestation d'un agent de gare captée (groupe `gares`) : type qui commence par CPI, SPI, OPI, PA ou EXTRA (« CPI_AM »,
 * « OPI 6-14 », « PA_PM », « EXTRA CPI »). Tout le reste (repos, congés, absences, formations, visites médicales : RW,
 * CW, CV, RR, ADA, IDEV…) est ignoré. « PACO… » ne commence pas par « PA » en mot entier.
 */
export function isStationCode(code: string): boolean {
  return /^(CPI|SPI|OPI|PA|EXTRA)( |$)/.test(fold(code));
}

/** Poste d'une prestation de gare d'après son type (« EXTRA CPI » → EXTRA, « OPI 6-14 » → OPI) ; "" si non captée. */
export function stationPost(code: string): StationPost | "" {
  const m = fold(code).match(/^(CPI|SPI|OPI|PA|EXTRA)( |$)/);
  return (m?.[1] as StationPost | undefined) ?? "";
}

export type PlannerBaseRef = { code: string; name: string; district?: string };

/**
 * Gare de base d'une prestation de gare d'après sa section (« CPI MONS », « OPI Mons », « SPI Liège »…) : mots de poste
 * et nombres retirés, puis comparaison tolérante (accents, casse, tirets) avec le nom ou le code des bases du
 * planificateur — nom identique, nom qui commence par la saisie (« LIEGE GUILLEMINS » ↔ « Liège-Guillemins »), ou premier
 * mot identique (« VERVIERS » → Verviers-Central). Plusieurs bases possibles = aucune (pas de devinette).
 */
export function stationBase<T extends PlannerBaseRef>(text: string, bases: readonly T[]): T | null {
  const words = fold(text)
    .split(" ")
    .filter((w) => w && !(STATION_POSTS as readonly string[]).includes(w) && !/^\d+$/.test(w));
  if (!words.length) return null;
  const rest = words.join(" ");
  const tiers: ((b: T) => boolean)[] = [
    (b) => fold(b.name) === rest || fold(b.code) === rest,
    (b) => fold(b.name).startsWith(`${rest} `) || rest.startsWith(`${fold(b.name)} `),
    (b) => fold(b.name).split(" ")[0] === words[0] || words.includes(fold(b.code)),
    // Nom (ou son premier mot) cité n'importe où : « Gare de Mons », « PACO Namur ».
    (b) => ` ${rest} `.includes(` ${fold(b.name).split(" ")[0]} `),
  ];
  for (const test of tiers) {
    const hits = bases.filter(test);
    if (hits.length === 1) return hits[0]!;
    if (hits.length > 1) return null;
  }
  return null;
}

/**
 * District d'une prestation d'après la table « lieu → district » (Admin › Quinyx) : le motif le plus long trouvé en
 * mots entiers dans le texte (« PACO_AM PACO Mons » contient « MONS » ; « EXTRA - OCC SO » contient « OCC SO »).
 */
export function placeDistrict(text: string, places: Place[]): string {
  const t = ` ${fold(text)} `;
  let best: Place | null = null;
  for (const p of places) {
    const f = fold(p.pattern);
    if (!f || !(QUINYX_DISTRICTS as readonly string[]).includes(p.district)) continue;
    if (t.includes(` ${f} `) && (!best || f.length > fold(best.pattern).length)) best = p;
  }
  return best?.district ?? "";
}

// --- Lot envoyé par l'extension (un groupe Quinyx, une période) ---

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// Heure locale complète et valide (audit du 14 oct. 2026 : « 99:99 » faisait échouer tout le lot).
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/);
const id = z
  .union([z.number().int().nonnegative(), z.string().regex(/^\d{1,15}$/)])
  .transform(String);
const name = z.string().max(120).catch("");

export const quinyxBatchSchema = z.object({
  group: z.string().regex(/^\d{1,15}$/),
  from: day,
  to: day,
  /** Date de publication Quinyx (`publish-date`) : planning publié jusqu'à ce jour INCLUS (confirmé le 14 oct. 2026). */
  publishedUntil: day,
  unit: z.string().max(160).catch(""),
  // Bornes réalistes (un groupe ≈ 15 agents, 300 prestations par mois) : un lot coûte une requête par prestation.
  sections: z.array(z.object({ id, name })).max(100),
  types: z.array(z.object({ id, name })).max(300),
  employees: z.array(z.object({ id, firstname: name, lastname: name })).max(300),
  shifts: z
    .array(
      z.object({
        id,
        groupId: id,
        begin: localDateTime,
        end: localDateTime,
        shiftTypeId: id,
        employeeId: id,
        status: z.string().max(20).optional(),
      }),
    )
    .max(1500),
  /**
   * Agents que le compte Quinyx de l'expéditeur voit dans le groupe (identifiants seuls, sans nom) : une prestation
   * disparue n'est retirée que pour eux (un compte qui ne voit que ses propres prestations n'efface pas les autres).
   */
  visible: z.array(id).max(500).optional(),
  /** Lot complet (rien de tronqué) : les prestations disparues de Quinyx sont alors retirées de CSM. */
  complete: z.boolean().optional(),
  /**
   * Services PACO / RCCA publiés SANS agent affecté (extension 1.11.0, 23 oct. 2026) ; absent des versions antérieures
   * (rien n'est alors ajouté ni retiré). Aucun agent, donc aucune donnée personnelle.
   */
  open: z
    .array(
      z.object({
        id,
        groupId: id,
        begin: localDateTime,
        end: localDateTime,
        shiftTypeId: id,
        status: z.string().max(20).optional(),
      }),
    )
    .max(1500)
    .optional(),
  /** Liste `open` tronquée : les services non pourvus disparus ne sont pas retirés. */
  openComplete: z.boolean().optional(),
});
export type QuinyxBatch = z.infer<typeof quinyxBatchSchema>;

export type MappedShift = {
  quinyx_id: string;
  group_id: string;
  employee: string;
  day: string;
  start: string;
  end: string;
  code: string;
  section: string;
  kind: QuinyxKind;
  district: string;
  /** Poste de gare (groupe `gares`) ; "" pour l'équipe. */
  post: StationPost | "";
  /** Nom FR de la gare de base (groupe `gares`, d'après la section) ; "" sinon. */
  base: string;
};
export type MappedAgent = { quinyx_id: string; first_name: string; last_name: string };

/**
 * Prestations à garder : affectées à un agent, code PACO / RCCA / EXTRA, jour dans la période et avant la date de
 * publication. `groupDistrict` = district par défaut du groupe (si aucun lieu de la table ne correspond).
 */
export function mapQuinyxBatch(
  batch: QuinyxBatch,
  places: Place[],
  groupDistrict = "",
  /** Groupe `gares` : prestations CPI / SPI / OPI / PA / EXTRA, poste et base déduits (bases du planificateur). */
  station?: { purpose: GroupPurpose; bases: readonly PlannerBaseRef[] },
): { shifts: MappedShift[]; agents: MappedAgent[]; ignored: number } {
  const gares = station?.purpose === "gares";
  const types = new Map(batch.types.map((t) => [t.id, t.name.trim()]));
  const sections = new Map(batch.sections.map((s) => [s.id, s.name.trim()]));
  const people = new Map(batch.employees.map((e) => [e.id, e]));
  const shifts: MappedShift[] = [];
  const agents = new Map<string, MappedAgent>();
  let ignored = 0;
  for (const s of batch.shifts) {
    const code = types.get(s.shiftTypeId) ?? "";
    const d = s.begin.slice(0, 10);
    const assigned = (s.status ?? "ASSIGNED").toUpperCase() === "ASSIGNED" && s.employeeId !== "0";
    if (
      !assigned ||
      !(gares ? isStationCode(code) : isCapturedCode(code)) ||
      d < batch.from ||
      d > batch.to ||
      d > batch.publishedUntil
    ) {
      ignored++;
      continue;
    }
    // Section (« PACO Mons ») ; la prestation rattachée au groupe lui-même n'a pas de section propre.
    const section = s.groupId === batch.group ? "" : (sections.get(s.groupId) ?? "");
    const startTime = s.begin.slice(11, 16);
    const endTime = s.end.slice(11, 16);
    const start = brusselsToUtc(d, startTime);
    const end = brusselsToUtc(s.end.slice(0, 10), endTime);
    // Durée de 0 à 24 h seulement (fin avant le début, ou prestation de plusieurs jours : ignorée).
    if (end <= start || Date.parse(end) - Date.parse(start) > 24 * 3600_000) {
      ignored++;
      continue;
    }
    // Gare de base : section (« CPI MONS »), sinon le type (« EXTRA CPI Mons »), sinon l'unité du groupe.
    const base =
      gares && station
        ? (stationBase(section, station.bases) ??
          stationBase(code, station.bases) ??
          stationBase(batch.unit, station.bases))
        : null;
    const baseDistrict =
      base && (QUINYX_DISTRICTS as readonly string[]).includes(base.district ?? "")
        ? String(base.district)
        : "";
    const district =
      baseDistrict ||
      placeDistrict(`${code} ${section}`, places) ||
      placeDistrict(batch.unit, places) ||
      ((QUINYX_DISTRICTS as readonly string[]).includes(groupDistrict) ? groupDistrict : "");
    shifts.push({
      quinyx_id: s.id,
      group_id: batch.group,
      employee: s.employeeId,
      day: d,
      start,
      end,
      code: code.slice(0, 80),
      section: section.slice(0, 80),
      kind: shiftKind(code, startTime),
      district,
      post: gares ? stationPost(code) : "",
      base: base ? base.name.slice(0, 80) : "",
    });
    if (!agents.has(s.employeeId)) {
      const p = people.get(s.employeeId);
      agents.set(s.employeeId, {
        quinyx_id: s.employeeId,
        first_name: (p?.firstname ?? "").trim().slice(0, 80),
        last_name: (p?.lastname ?? "").trim().slice(0, 80),
      });
    }
  }
  return { shifts, agents: [...agents.values()], ignored };
}

// --- Services non pourvus (23 oct. 2026) ---

export const OPEN_FUNCTIONS = ["paco", "rcca"] as const;
export type OpenFunction = (typeof OPEN_FUNCTIONS)[number];
export const FUNCTION_LABEL: Record<OpenFunction, string> = { paco: "PACO", rcca: "RCCA" };
export const OPEN_KINDS = ["am", "pm", "nuit", "autre"] as const;
export type OpenKind = (typeof OPEN_KINDS)[number];

/** Prestations qui existent (précision de l'utilisateur, 23 oct. 2026) : la nuit est PACO seulement, pas de RCCA de nuit. */
export const OPEN_SERVICES: readonly { function: OpenFunction; kind: OpenKind }[] = [
  { function: "paco", kind: "am" },
  { function: "paco", kind: "pm" },
  { function: "paco", kind: "nuit" },
  { function: "rcca", kind: "am" },
  { function: "rcca", kind: "pm" },
];

/** Services proposés au filtre pour les fonctions choisies (RCCA seul : pas de nuit). */
export function openKindsFor(functions: readonly OpenFunction[]): OpenKind[] {
  const fns = functions.length ? functions : OPEN_FUNCTIONS;
  return (["am", "pm", "nuit"] as const).filter((k) =>
    OPEN_SERVICES.some((s) => s.kind === k && fns.includes(s.function)),
  );
}

/** Fonction d'un service d'après son type (« PACO_AM » → paco, « RCCA_PM » → rcca) ; "" pour tout le reste (EXTRA…). */
export function openFunction(code: string): OpenFunction | "" {
  const m = fold(code).match(/^(PACO|RCCA) /);
  return m ? (m[1]!.toLowerCase() as OpenFunction) : "";
}

export type MappedOpenShift = {
  quinyx_id: string;
  group_id: string;
  day: string;
  start: string;
  end: string;
  code: string;
  section: string;
  kind: OpenKind;
  function: OpenFunction;
  district: string;
  status: string;
};

/**
 * Services non pourvus à garder : type PACO_… / RCCA_… (pas EXTRA), sans agent, jour dans la période et au plus tard à la
 * date de publication, durée de 0 à 24 h. Un service marqué supprimé / annulé dans Quinyx est ignoré.
 */
export function mapOpenShifts(
  batch: QuinyxBatch,
  places: Place[],
  groupDistrict = "",
): { shifts: MappedOpenShift[]; ignored: number } {
  const types = new Map(batch.types.map((t) => [t.id, t.name.trim()]));
  const sections = new Map(batch.sections.map((s) => [s.id, s.name.trim()]));
  const shifts: MappedOpenShift[] = [];
  let ignored = 0;
  for (const s of batch.open ?? []) {
    const code = types.get(s.shiftTypeId) ?? "";
    const fn = openFunction(code);
    const d = s.begin.slice(0, 10);
    const status = (s.status ?? "").toUpperCase();
    if (
      !fn ||
      /DELET|CANCEL/.test(status) ||
      d < batch.from ||
      d > batch.to ||
      d > batch.publishedUntil
    ) {
      ignored++;
      continue;
    }
    const startTime = s.begin.slice(11, 16);
    const start = brusselsToUtc(d, startTime);
    const end = brusselsToUtc(s.end.slice(0, 10), s.end.slice(11, 16));
    if (end <= start || Date.parse(end) - Date.parse(start) > 24 * 3600_000) {
      ignored++;
      continue;
    }
    const section = s.groupId === batch.group ? "" : (sections.get(s.groupId) ?? "");
    const kind = shiftKind(code, startTime);
    shifts.push({
      quinyx_id: s.id,
      group_id: batch.group,
      day: d,
      start,
      end,
      code: code.slice(0, 80),
      section: section.slice(0, 80),
      kind: kind === "extra" ? "autre" : kind,
      function: fn,
      district:
        placeDistrict(`${code} ${section}`, places) ||
        placeDistrict(batch.unit, places) ||
        ((QUINYX_DISTRICTS as readonly string[]).includes(groupDistrict) ? groupDistrict : ""),
      status: status.slice(0, 20),
    });
  }
  return { shifts, ignored };
}

/** Filtres de la vue « Services non pourvus » (et de l'export). */
export type OpenFilter = {
  year: number;
  /** 1 à 12 ; 0 = toute l'année. */
  month: number;
  /** Groupes Quinyx (OCC Mons, OCC Namur…) ; vide = tous. */
  groups: string[];
  functions: OpenFunction[];
  kinds: OpenKind[];
};

/** Bornes de jours « AAAA-MM-JJ » (incluses) d'un mois ou d'une année. */
export function openPeriod(year: number, month: number): { from: string; to: string } {
  const y = String(year).padStart(4, "0");
  if (!month) return { from: `${y}-01-01`, to: `${y}-12-31` };
  const m = String(month).padStart(2, "0");
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2, "0")}` };
}

/** Lecture des paramètres d'URL de la vue / de la route (valeurs inconnues écartées, défaut : mois de `today`). */
export function parseOpenFilter(
  params: { get(name: string): string | null; getAll(name: string): string[] },
  today: string,
): OpenFilter {
  const list = (name: string) =>
    params
      .getAll(name)
      .flatMap((v) => v.split(","))
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
  const year = Number(params.get("annee"));
  const rawMonth = params.get("mois");
  const month = rawMonth === null ? Number(today.slice(5, 7)) : Number(rawMonth);
  return {
    year: Number.isInteger(year) && year >= 2020 && year <= 2100 ? year : Number(today.slice(0, 4)),
    month: Number.isInteger(month) && month >= 0 && month <= 12 ? month : Number(today.slice(5, 7)),
    groups: params
      .getAll("zone")
      .flatMap((v) => v.split(","))
      .map((v) => v.trim())
      .filter((v) => /^\d{1,15}$/.test(v)),
    functions: list("fonction").filter((v): v is OpenFunction =>
      (OPEN_FUNCTIONS as readonly string[]).includes(v),
    ),
    kinds: list("type").filter((v): v is OpenKind => (OPEN_KINDS as readonly string[]).includes(v)),
  };
}

/** Paramètres d'URL d'un filtre (liens d'export). */
export function openFilterQuery(f: OpenFilter): string {
  const q = new URLSearchParams({ annee: String(f.year), mois: String(f.month) });
  for (const g of f.groups) q.append("zone", g);
  for (const v of f.functions) q.append("fonction", v);
  for (const v of f.kinds) q.append("type", v);
  return q.toString();
}

export const MONTH_NAMES = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

/** « octobre 2026 » ou « année 2026 ». */
export function openPeriodLabel(f: Pick<OpenFilter, "year" | "month">): string {
  return f.month ? `${MONTH_NAMES[f.month - 1]} ${f.year}` : `année ${f.year}`;
}

/** Libellé d'une prestation : « PACO_AM · PACO Mons ». */
export function shiftLabel(s: { code: string; section: string }): string {
  return s.section ? `${s.code} · ${s.section}` : s.code;
}

/**
 * Prestation qui fixe les districts du jour d'un agent (15 oct. 2026 : district activé d'office d'après Quinyx) : celle en
 * cours (nuit de la veille comprise tant qu'elle dure), sinon la prochaine du jour, sinon la dernière du jour. Liste
 * triée par début ; `day` = jour de service (Europe/Brussels), `start` / `end` = instants ISO.
 */
export function pickDutyShift<T extends { day: string; start: string; end: string }>(
  list: readonly T[],
  now: number,
  today: string,
): T | null {
  const live = list.find((s) => Date.parse(s.start) <= now && now < Date.parse(s.end));
  if (live) return live;
  const todays = list.filter((s) => s.day === today);
  return todays.find((s) => Date.parse(s.start) > now) ?? todays.at(-1) ?? null;
}

// --- Correspondance agent Quinyx ↔ compte CSM ---

const tokens = (s: string) => fold(s).split(" ").filter(Boolean);

/**
 * Compte CSM proposé pour un agent Quinyx : nom complet identique, mots dans n'importe quel ordre, accents et casse
 * ignorés (« Dupont Jean » = « Jean DUPONT »). Une seule correspondance possible, sinon rien (l'admin choisit).
 */
export function suggestUser(
  agent: { first_name: string; last_name: string },
  users: { id: string; name: string }[],
): string {
  const want = tokens(`${agent.first_name} ${agent.last_name}`).sort().join(" ");
  if (!want || !agent.last_name.trim()) return "";
  const hits = users.filter((u) => tokens(u.name).sort().join(" ") === want);
  return hits.length === 1 ? hits[0]!.id : "";
}

/** Nom affiché d'un agent Quinyx (« Jean Dupont », sinon « Agent Quinyx »). */
export function agentName(a: object): string {
  const r = a as { first_name?: unknown; last_name?: unknown };
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return `${s(r.first_name)} ${s(r.last_name)}`.trim() || "Agent Quinyx";
}

/** Prestation en cours ou à venir le jour `day` pour l'agent, la plus proche de `now`. */
export function currentShift<T extends { start: string; end: string }>(
  shifts: T[],
  now: Date = new Date(),
): T | null {
  const t = now.getTime();
  const sorted = [...shifts].sort((a, b) => a.start.localeCompare(b.start));
  return (
    sorted.find((s) => Date.parse(s.start) <= t && t < Date.parse(s.end)) ??
    sorted.find((s) => Date.parse(s.start) > t) ??
    null
  );
}

// --- Écran Équipe › Planning ---

/** Les 7 jours (lundi → dimanche) de la semaine qui contient `day`. */
export function weekDays(day: string): string[] {
  const d = new Date(`${day}T12:00:00Z`);
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  return Array.from({ length: 7 }, (_, i) =>
    new Date(monday.getTime() + i * 86_400_000).toISOString().slice(0, 10),
  );
}

export const KIND_ORDER: QuinyxKind[] = ["am", "pm", "nuit", "extra", "autre"];

/** Heure « HH:MM » de Bruxelles d'un instant ISO. */
export function brusselsClock(isoValue: string): string {
  const d = new Date(isoValue);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("fr-BE", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

/** Lignes de la vue semaine : un agent par ligne (trié par nom), ses prestations par jour. */
export function weekRows<T extends { agentId: string; name: string; day: string }>(
  shifts: T[],
): { agentId: string; name: string; byDay: Map<string, T[]> }[] {
  const rows = new Map<string, { agentId: string; name: string; byDay: Map<string, T[]> }>();
  for (const s of shifts) {
    const row = rows.get(s.agentId) ?? { agentId: s.agentId, name: s.name, byDay: new Map() };
    row.byDay.set(s.day, [...(row.byDay.get(s.day) ?? []), s]);
    rows.set(s.agentId, row);
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/** District Quinyx (code) → district du jour de CSM (« Sud-Ouest »…) ; DNO / DNE n'ont pas d'équivalent d'équipe. */
export const DUTY_NAME: Record<string, string> = {
  DSO: "Sud-Ouest",
  DSE: "Sud-Est",
  DCE: "Centre",
};

/** Part maximale de la période retirée d'un coup (au-delà : lot partiel ou forgé, rien n'est retiré). */
export const MAX_REMOVAL_SHARE = 0.3;
/** Les prestations disparues peuvent-elles être retirées ? (5 au moins, sinon 30 % de celles de la période.) */
export function removalAllowed(stored: number, toRemove: number): boolean {
  return toRemove <= Math.max(5, Math.floor(stored * MAX_REMOVAL_SHARE));
}

/**
 * Comptes CSM dont on garde les horaires (demande du 14 oct. 2026 : « seulement les PACO / RCCA de CSM ») : PACO/RCCA,
 * Modérateur, et les administrateurs qui travaillent aussi en PACO. Jamais Invité, Écran, connecteur ni désactivé.
 * Rôles v3, lot L2 : comptes qui ont `quinyx:read` (`users.perms`, lisible par le compte de service) ; rôles en dur
 * seulement si `perms` est absent (instance sans le champ).
 */
export const TEAM_ROLES = ["paco", "moderator", "admin", "sysop"] as const;
export function isTeamAccount(user: { role?: unknown; perms?: unknown }): boolean {
  if (["disabled", "screen", "connector"].includes(String(user.role))) return false;
  if (Array.isArray(user.perms)) return user.perms.includes("quinyx:read");
  return (TEAM_ROLES as readonly unknown[]).includes(user.role);
}

/**
 * Numéro de groupe Quinyx tiré d'une saisie : adresse copiée depuis Quinyx (`…/schedule/123456?start=…&timeframe=…`,
 * paramètres de la vue ignorés), numéro en fin de saisie, sinon la saisie telle quelle (refusée ensuite si ce ne sont pas
 * des chiffres).
 */
export function quinyxGroupId(input: string): string {
  const v = input.trim();
  return v.match(/\/schedule\/(\d{1,15})(?:[/?#]|$)/)?.[1] ?? v.match(/(\d{1,15})\/?$/)?.[1] ?? v;
}
