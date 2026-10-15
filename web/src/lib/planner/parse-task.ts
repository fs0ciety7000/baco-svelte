// Saisie manuelle d'une prise en charge au format de l'export ALEA / des classeurs (REGLES §6.2, CADRAGE §4) :
//   1NV 07h16 906 IN de MONS à Charleroi-Central n°AAAA-MM-JJ-NNNN [nom] [téléphone]
//   1MR + 1DCO 10:16 E2129 OUT à TOURNAI venant de Mons n° AAAA-MM-JJ-NNNN
//   1CRE 07h40 E2129 IN VERS LL            (consigne des classeurs : gare assistée = `station` des options)
// Le nom et le téléphone éventuels en fin de ligne ne sont JAMAIS renvoyés (ni dans les tâches ni dans les erreurs) :
// seul `ignoredPersonal: true` le signale. Le dossier suffit, la fiche DICOS porte le nominatif sous `pmr:read`.

import { addDays, brusselsToUtc, isValidDay } from "@/lib/orders/time";
import { canonicalStation, foldStation, type StationRef } from "@/lib/stations/search";
import { PMR_TYPES, WHEELCHAIR_TYPES, taskWindow } from "./window";
import { DEFAULT_PLANNER_SETTINGS, type PlannerSettings, type PlannerTask } from "./types";

export type ParsedTask = Omit<PlannerTask, "id"> & {
  /** N° de ligne (1 = première ligne du texte collé). */
  line: number;
  /** Détail des types (« 1MR + 1DCO »). */
  types: { type: string; count: number }[];
  /** Vrai si un nom ou un téléphone figurait en fin de ligne (ignoré). */
  ignoredPersonal: boolean;
};

export type ParseIssue = { line: number; level: "error" | "warn"; message: string };

export type ParseOptions = {
  /** Jour de service « AAAA-MM-JJ » (Bruxelles). */
  day: string;
  /** Référentiel des gares : noms ramenés au nom retenu (« fms » → « Mons ») et fin de ligne mieux séparée. */
  stations?: StationRef[];
  /** Gare assistée par défaut quand la ligne ne la donne pas (« IN VERS LL » collé dans le bloc d'une gare). */
  station?: string;
  settings?: PlannerSettings;
};

export type ParseResult = { tasks: ParsedTask[]; errors: ParseIssue[]; ignoredPersonal: boolean };

const DOSSIER = /\d{4}-\d{2}-\d{2}-\d{4}/;
const MARKER = /(?:^|\s)n\s?[°º]/iu;
const PHONE = /(?:^|\s)(?:\+|00)?\d[\d\s./-]{6,}\d\s*$/u;
const NO_FILE = /informations?\s+sur\s+le\s+client/iu;

const IN_FULL = /^(?:de|depuis)\s+(.+?)(?:\s+(?:à|a|vers)\s+(.+))?$/iu;
const IN_OTHER = /^(?:vers|à|a)\s+(.+)$/iu;
const OUT_FULL = /^(?:à|a)\s+(.+?)(?:\s+(?:venant\s+de|de|depuis)\s+(.+))?$/iu;
const OUT_OTHER = /^(?:venant\s+de|de|depuis)\s+(.+)$/iu;

/** Analyse plusieurs lignes collées : une prise en charge par ligne, lignes vides ignorées. */
export function parseTaskLines(text: string, options: ParseOptions): ParseResult {
  const tasks: ParsedTask[] = [];
  const errors: ParseIssue[] = [];
  if (!isValidDay(options.day)) {
    errors.push({ line: 0, level: "error", message: "jour de service invalide" });
    return { tasks, errors, ignoredPersonal: false };
  }
  const lines = String(text ?? "").split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.replace(/[\t ]/g, " ").trim();
    if (!line) return;
    const r = parseLine(line, i + 1, options);
    errors.push(...r.issues);
    if (r.task) tasks.push(r.task);
  });
  return { tasks, errors, ignoredPersonal: tasks.some((t) => t.ignoredPersonal) };
}

function parseLine(
  line: string,
  n: number,
  o: ParseOptions,
): { task?: ParsedTask; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];
  const fail = (message: string) => ({
    issues: [...issues, { line: n, level: "error" as const, message }],
  });
  const warn = (message: string) => issues.push({ line: n, level: "warn", message });
  let rest = line;

  // Types : « 1NV », « 1MR + 1DCO », « 2CRF+1CRP ».
  const types: { type: string; count: number }[] = [];
  let m = /^(\d{1,2})\s*([A-Za-z]{2,4})(?=[\s+]|$)/u.exec(rest);
  if (!m) return fail("il manque le type et le nombre de PMR (ex. 1NV)");
  while (m) {
    types.push({ type: m[2]!.toUpperCase(), count: Number(m[1]) });
    rest = rest.slice(m[0].length);
    m = /^\s*\+\s*(\d{1,2})\s*([A-Za-z]{2,4})(?=[\s+]|$)/u.exec(rest);
  }
  for (const t of types)
    if (!(PMR_TYPES as readonly string[]).includes(t.type))
      warn(`type « ${t.type} » inconnu, compté comme PMR light`);

  // Heure du train : « 07h16 », « 7H16 », « 10:16 », préfixe « NUIT » toléré.
  m = /^\s*(nuit\s+)?(\d{1,2})\s*[hH:]\s*(\d{2})(?=\s|$)/iu.exec(rest);
  if (!m) return fail("il manque l'heure du train (ex. 07h16)");
  const night = !!m[1];
  const hour = Number(m[2]);
  const minute = Number(m[3]);
  if (hour > 23 || minute > 59) return fail("heure du train illisible");
  rest = rest.slice(m[0].length);

  // Train ou taxi ; n° technique entre parenthèses ignoré (« 908 (19909) »).
  m = /^\s*(TAXI|[A-Za-z]{1,3}\s?\d{1,6}|\d{1,6})(?=[\s(]|$)(?:\s*\(\s*\d+\s*\))?/iu.exec(rest);
  if (!m) return fail("il manque le n° de train (ou TAXI)");
  const trainRaw = m[1]!.replace(/\s+/g, "").toUpperCase();
  const taxi = trainRaw === "TAXI";
  rest = rest.slice(m[0].length);

  // Sens.
  m = /^\s*(IN|OUT)(?=\s|$)/iu.exec(rest);
  if (!m) return fail("il manque le sens (IN ou OUT)");
  const dir = m[1]!.toUpperCase() as "IN" | "OUT";
  rest = rest.slice(m[0].length).trim();

  // Dossier et fin de ligne (nominatif) : tout ce qui suit « n° » ou le n° de dossier.
  let personal = false;
  let dossier: string | undefined;
  const mk = MARKER.exec(rest);
  const dm = DOSSIER.exec(rest);
  const cut = Math.min(mk ? mk.index : Infinity, dm ? dm.index : Infinity);
  let route = rest;
  if (Number.isFinite(cut)) {
    route = rest.slice(0, cut).trim();
    let tail = rest.slice(cut);
    const d = DOSSIER.exec(tail);
    if (d) {
      dossier = d[0];
      tail = tail.slice(0, d.index) + " " + tail.slice(d.index + d[0].length);
    }
    tail = tail.replace(MARKER, " ").replace(NO_FILE, " ").trim();
    if (tail) personal = true;
  }

  // Gares.
  const full = (dir === "IN" ? IN_FULL : OUT_FULL).exec(route);
  const other = full ? null : (dir === "IN" ? IN_OTHER : OUT_OTHER).exec(route);
  if (!full && !other)
    return fail(
      dir === "IN"
        ? "il manque la gare (IN de <gare> à <autre gare>)"
        : "il manque la gare (OUT à <gare> venant de <autre gare>)",
    );
  const refs = o.stations?.length ? o.stations : undefined;
  let assisted = full ? full[1]! : (o.station ?? "");
  let otherStation = full ? full[2] : other![1];
  const lastIsOther = otherStation !== undefined;
  const unmarked = !Number.isFinite(cut);
  if (refs) {
    // Référentiel fourni (l'écran le fournit toujours) : chaque gare = plus longue suite de mots reconnue, le reste (nom,
    // téléphone) est écarté ; une gare inconnue bloque la ligne (aucun repli qui garderait des mots en trop).
    const a = resolveStation(assisted, refs);
    if (!a) return fail("gare inconnue : vérifie l'orthographe");
    assisted = a.station;
    personal ||= a.personal;
    if (otherStation?.trim()) {
      const b = resolveStation(otherStation, refs);
      if (!b) return fail("autre gare inconnue : vérifie l'orthographe");
      otherStation = b.station;
      personal ||= b.personal;
    }
  } else if (unmarked) {
    // Sans référentiel (repli) : découpe de fin sur la gare assistée ET sur la dernière gare.
    if (full) {
      const a = splitTail(assisted);
      personal ||= a.personal;
      if (a.uncertain) warn("gare à vérifier");
      assisted = a.station;
    }
    if (lastIsOther) {
      const split = splitTail(otherStation!);
      personal ||= split.personal;
      if (split.uncertain) warn("autre gare à vérifier");
      otherStation = split.station;
    }
  }
  assisted = assisted.trim();
  if (!assisted) return fail("il manque la gare assistée (IN de <gare> ou OUT à <gare>)");
  const canon = (s: string) => s.trim();

  const counts = types.reduce((a, t) => a + t.count, 0);
  const chair = types.find((t) => (WHEELCHAIR_TYPES as readonly string[]).includes(t.type));
  const known = types.find((t) => (PMR_TYPES as readonly string[]).includes(t.type));
  const day = o.day;
  // « NUIT 05h10 » (00h00-05h59) = nuit qui SUIT le jour de la feuille : train le lendemain, tâche gardée sur le jour de
  // planification (l'écran du jour affiche la nuit jusqu'à 8 h le lendemain).
  const trainDay = night && hour < 6 ? addDays(day, 1) : day;
  const trainAt = brusselsToUtc(
    trainDay,
    `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  );
  const base: Omit<PlannerTask, "id"> = {
    day,
    kind: dir === "IN" ? "pmr_in" : "pmr_out",
    trainAt,
    start: trainAt,
    end: trainAt,
    station: canon(assisted),
    ...(otherStation?.trim() ? { otherStation: canon(otherStation) } : {}),
    ...(taxi ? {} : { train: trainRaw }),
    ...(chair || known ? { pmrType: (chair ?? known)!.type } : {}),
    pax: Math.max(1, counts),
    light: !chair,
    ...(dossier ? { dossier } : {}),
    source: "manuel",
    status: taxi ? "attribuee" : "a_attribuer",
    ...(taxi ? { assignee: { kind: "taxi" as const, label: "Taxi" } } : {}),
  };
  const win = taskWindow({ ...base, id: "" }, o.settings ?? DEFAULT_PLANNER_SETTINGS);
  return { task: { ...base, ...win, line: n, types, ignoredPersonal: personal }, issues };
}

const isUpperWord = (w: string) => /\p{L}{2}/u.test(w) && w === w.toUpperCase();

/** Téléphone en fin de segment retiré. */
function dropPhone(seg: string): { s: string; personal: boolean } {
  const s = seg.trim();
  const ph = PHONE.exec(s);
  return ph ? { s: s.slice(0, ph.index).trim(), personal: true } : { s, personal: false };
}

/**
 * Gare d'un segment d'après le référentiel : téléphone retiré, puis plus longue suite de mots reconnue (abréviation,
 * nom FR / NL, alias), ramenée au nom retenu (FR). Les mots qui suivent (nom du voyageur) sont écartés (`personal`).
 * Null si aucune suite n'est reconnue : la ligne est alors refusée (« gare inconnue »), jamais gardée telle quelle.
 */
export function resolveStation(
  seg: string,
  refs: StationRef[],
): { station: string; personal: boolean } | null {
  const { s, personal } = dropPhone(seg);
  const words = s.split(/\s+/).filter(Boolean);
  for (let k = words.length; k >= 1; k--) {
    const cand = words.slice(0, k).join(" ");
    const f = foldStation(cand);
    const up = cand.toUpperCase();
    if (
      refs.some(
        (r) =>
          r.names[0] && (r.abbr?.toUpperCase() === up || r.names.some((x) => foldStation(x) === f)),
      )
    )
      return {
        station: canonicalStation(cand, refs),
        personal: personal || k < words.length,
      };
  }
  return null;
}

/**
 * Sans référentiel : sépare une gare du nominatif qui peut la suivre (téléphone retiré ; la gare en casse normale
 * (DICOS) s'arrête au premier mot en majuscules). Une gare en majuscules de plusieurs mots est incertaine : seul le
 * premier mot est gardé.
 */
function splitTail(seg: string): { station: string; personal: boolean; uncertain: boolean } {
  const { s, personal } = dropPhone(seg);
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { station: s, personal, uncertain: false };
  if (!isUpperWord(words[0]!)) {
    let k = 1;
    while (k < words.length && !isUpperWord(words[k]!)) k++;
    return {
      station: words.slice(0, k).join(" "),
      personal: personal || k < words.length,
      uncertain: false,
    };
  }
  return { station: words[0]!, personal: true, uncertain: true };
}
