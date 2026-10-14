// Annuaire (Ressources › Annuaire) : recherche instantanée tolérante, classement par pertinence, surlignage, numéros de
// téléphone, favoris et récents (refonte du 14 oct. 2026, `docs/design/REFONTE-ANNUAIRE.md`). Logique pure, sans
// import : utilisée par le composant client (filtrage à chaque frappe sur ≈ 400 fiches) et par le serveur (alias de
// gare), testée par `directory.test.ts`.

/** Fiche telle que la reçoit la recherche (`aliases` = abréviation PtCar et autres noms des gares citées). */
export type DirectoryEntry = {
  id: string;
  name: string;
  phone: string;
  email: string;
  category: string;
  zone: string;
  group: string;
  note: string;
  aliases: string[];
};

// ---------------------------------------------------------------------------------------------------
// Normalisation

const LIGATURES: Record<string, string> = { œ: "oe", Œ: "oe", æ: "ae", Æ: "ae", ß: "ss" };

/**
 * Texte replié avec la position d'origine de chaque caractère : minuscules, sans accent, ligatures dépliées,
 * ponctuation → espace simple. `map[i]` = index dans le texte d'origine du caractère replié `i` (surlignage).
 */
export function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = "";
  const map: number[] = [];
  const src = String(text ?? "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    const base = (LIGATURES[ch] ?? ch).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    for (const c of base) {
      if (/[a-z0-9]/.test(c)) {
        folded += c;
        map.push(i);
      } else if (folded && !folded.endsWith(" ")) {
        folded += " ";
        map.push(i);
      }
    }
  }
  if (folded.endsWith(" ")) {
    folded = folded.slice(0, -1);
    map.pop();
  }
  return { folded, map };
}

/** Forme repliée (voir `foldWithMap`). */
export const foldText = (text: string) => foldWithMap(text).folded;

/**
 * Chiffres d'un numéro sous forme nationale : « +32 65 58 12 34 », « 0032 65… » et « 065/58.12.34 » → « 065581234 ».
 * `map` donne la position d'origine de chaque chiffre (−1 pour le « 0 » ajouté à la place de l'indicatif).
 */
export function phoneDigitsWithMap(phone: string): { digits: string; map: number[] } {
  const src = String(phone ?? "");
  let digits = "";
  const map: number[] = [];
  for (let i = 0; i < src.length; i++)
    if (/\d/.test(src[i]!)) {
      digits += src[i];
      map.push(i);
    }
  const intl = /^\s*(\+|00)/.test(src);
  const cut = intl && digits.startsWith("0032") ? 4 : intl && digits.startsWith("32") ? 2 : 0;
  if (cut) return { digits: "0" + digits.slice(cut), map: [-1, ...map.slice(cut)] };
  return { digits, map };
}

export const phoneDigits = (phone: string) => phoneDigitsWithMap(phone).digits;

/** Vrai si la saisie est un numéro (au moins 3 chiffres, seulement chiffres, espaces, « + », « / », « . », « - »). */
export function isPhoneQuery(q: string): boolean {
  const t = q.trim();
  return /^[+\d][\d\s./()-]*$/.test(t) && t.replace(/\D/g, "").length >= 3;
}

// ---------------------------------------------------------------------------------------------------
// Fautes de frappe

/** Distance de Damerau-Levenshtein restreinte (transposition de deux lettres voisines = 1), bornée à `max` + 1. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) rows.push([i]);
  for (let j = 1; j <= b.length; j++) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        v = Math.min(v, rows[i - 2]![j - 2]! + 1);
      rows[i]![j] = v;
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
  }
  return rows[a.length]![b.length]!;
}

/** Fautes tolérées pour un mot saisi : aucune sous 4 lettres, 1 jusqu'à 7, 2 au-delà. */
const tolerance = (len: number) => (len < 4 ? 0 : len < 8 ? 1 : 2);

/** Vrai si le mot saisi ressemble au début d'un mot du texte (« liegge » ≈ « liège », « dispacthing » ≈ « dispatching »). */
function fuzzyWord(token: string, words: string[]): string | null {
  const tol = tolerance(token.length);
  if (!tol) return null;
  for (const w of words) {
    if (w.length < token.length - tol) continue;
    for (let len = token.length - tol; len <= token.length + tol; len++) {
      if (len < 3 || len > w.length) continue;
      if (editDistance(token, w.slice(0, len), tol) <= tol) return w;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Recherche et classement

export type Query = {
  /** Mots repliés (au moins 1 caractère), dans l'ordre de la saisie. */
  tokens: string[];
  /** Numéro saisi (forme nationale) si la saisie entière est un numéro. */
  phone: string | null;
  raw: string;
};

export function parseQuery(raw: string): Query {
  const q = String(raw ?? "").slice(0, 80);
  if (isPhoneQuery(q)) return { tokens: [], phone: phoneDigits(q), raw: q };
  return { tokens: foldText(q).split(" ").filter(Boolean), phone: null, raw: q };
}

export const isEmptyQuery = (q: Query) => !q.phone && q.tokens.length === 0;

type Indexed = {
  e: DirectoryEntry;
  name: string;
  nameWords: string[];
  nameCompact: string;
  aliases: string[];
  aliasWords: string[];
  facets: string;
  facetWords: string[];
  note: string;
  noteWords: string[];
  email: string;
  phone: string;
};

const words = (s: string) => s.split(" ").filter(Boolean);

function indexEntry(e: DirectoryEntry): Indexed {
  const name = foldText(e.name);
  const aliases = e.aliases.map(foldText).filter(Boolean);
  const facets = foldText([e.category, e.group, e.zone].join(" "));
  const note = foldText(e.note);
  return {
    e,
    name,
    nameWords: words(name),
    nameCompact: name.replace(/ /g, ""),
    aliases,
    aliasWords: aliases.flatMap(words),
    facets,
    facetWords: words(facets),
    note,
    noteWords: words(note),
    email: foldText(e.email),
    phone: phoneDigits(e.phone),
  };
}

/** Index réutilisable (à mémoïser côté client : la liste ne change qu'à un rafraîchissement). */
export const buildIndex = (entries: DirectoryEntry[]) => entries.map(indexEntry);
export type DirectoryIndex = ReturnType<typeof buildIndex>;

const startsWord = (ws: string[], t: string) => ws.some((w) => w.startsWith(t));

/** Où le mot a été trouvé (pour l'aide sous le nom) : alias de gare, remarque, e-mail… */
export type MatchVia = "name" | "alias" | "facet" | "note" | "email" | "phone";

/** Score d'un mot dans une fiche (0 = absent) et champ qui l'a trouvé. */
function scoreToken(
  x: Indexed,
  t: string,
  fuzzy: boolean,
): { score: number; via: MatchVia } | null {
  // Nom : égalité, début, début de mot, contenu, forme compacte (« lalouviere »), puis faute de frappe.
  if (x.name === t) return { score: 120, via: "name" };
  if (x.name.startsWith(t)) return { score: 100, via: "name" };
  if (startsWord(x.nameWords, t)) return { score: 80, via: "name" };
  // Abréviation de gare exacte (« FMS », « FCR ») : presque aussi sûre que le nom.
  if (x.aliases.includes(t)) return { score: 90, via: "alias" };
  if (t.length >= 2 && x.name.includes(t)) return { score: 50, via: "name" };
  if (t.length >= 4 && x.nameCompact.includes(t)) return { score: 45, via: "name" };
  if (startsWord(x.aliasWords, t)) return { score: 55, via: "alias" };
  if (startsWord(x.facetWords, t)) return { score: 40, via: "facet" };
  if (/^\d{3,}$/.test(t) && x.phone.includes(t)) return { score: 70, via: "phone" };
  if (t.length >= 3 && x.facets.includes(t)) return { score: 25, via: "facet" };
  if (t.length >= 3 && x.email.includes(t)) return { score: 20, via: "email" };
  if (startsWord(x.noteWords, t)) return { score: 15, via: "note" };
  if (t.length >= 4 && x.note.includes(t)) return { score: 10, via: "note" };
  if (!fuzzy) return null;
  if (fuzzyWord(t, x.nameWords)) return { score: 30, via: "name" };
  if (fuzzyWord(t, x.aliasWords)) return { score: 20, via: "alias" };
  if (fuzzyWord(t, x.facetWords)) return { score: 12, via: "facet" };
  return null;
}

export type Hit = { entry: DirectoryEntry; score: number; via: MatchVia[] };

/**
 * Fiches qui contiennent TOUS les mots (dans n'importe quel ordre), classées par pertinence ; les fautes de frappe ne
 * sont tolérées que si rien ne correspond exactement. Un numéro est cherché
 * dans les chiffres du téléphone (avec ou sans espaces, +32 ou 0). Favoris (+15) et récents (+5) passent devant à
 * pertinence égale. Sans saisie : toutes les fiches, ordre alphabétique.
 */
export function searchDirectory(
  index: DirectoryIndex,
  q: Query,
  opts: {
    favorites?: readonly string[];
    recent?: readonly string[];
    /** Filtres de la page (catégorie, zone, groupe) : appliqués avant de décider du second passage. */
    keep?: (e: DirectoryEntry) => boolean;
  } = {},
): Hit[] {
  const fav = new Set(opts.favorites ?? []);
  const rec = new Set(opts.recent ?? []);
  const byName = (a: Hit, b: Hit) => a.entry.name.localeCompare(b.entry.name, "fr");
  const keep = opts.keep ?? (() => true);
  if (isEmptyQuery(q))
    return index
      .filter((x) => keep(x.e))
      .map((x) => ({ entry: x.e, score: 0, via: [] }))
      .sort(byName);
  const phrase = q.tokens.join(" ");
  const pass = (fuzzy: boolean) => {
    const hits: Hit[] = [];
    for (const x of index) {
      if (!keep(x.e)) continue;
      let score = 0;
      const via: MatchVia[] = [];
      if (q.phone) {
        if (!x.phone.includes(q.phone)) continue;
        score = x.phone.startsWith(q.phone) ? 100 : 90;
        via.push("phone");
      } else {
        let all = true;
        for (const t of q.tokens) {
          const s = scoreToken(x, t, fuzzy);
          if (!s) {
            all = false;
            break;
          }
          score += s.score;
          if (!via.includes(s.via)) via.push(s.via);
        }
        if (!all) continue;
        if (q.tokens.length > 1 && x.name.includes(phrase)) score += 40;
      }
      if (fav.has(x.e.id)) score += 15;
      if (rec.has(x.e.id)) score += 5;
      hits.push({ entry: x.e, score, via });
    }
    return hits;
  };
  // Fautes de frappe en second passage seulement : « mons » ne doit pas ramener « Mosans » ni « Mouscron ».
  let hits = pass(false);
  if (!hits.length && !q.phone) hits = pass(true);
  return hits.sort((a, b) => b.score - a.score || byName(a, b));
}

/**
 * Proposition quand rien ne correspond : le mot le plus proche (nom, gare, catégorie…) de chaque mot saisi, ou null.
 * « mosn » → « mons ». Seulement si la proposition donne au moins un résultat.
 */
export function suggestQuery(index: DirectoryIndex, q: Query): string | null {
  if (q.phone || !q.tokens.length) return null;
  const vocab = new Set<string>();
  for (const x of index)
    for (const w of [...x.nameWords, ...x.aliasWords, ...x.facetWords])
      if (w.length >= 3) vocab.add(w);
  let changed = false;
  const out = q.tokens.map((t) => {
    if (t.length < 3 || vocab.has(t)) return t;
    let best: string | null = null;
    let bestD = t.length >= 5 ? 3 : 2;
    for (const w of vocab) {
      const d = editDistance(t, w, bestD - 1);
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    if (best) changed = true;
    return best ?? t;
  });
  if (!changed) return null;
  const s = out.join(" ");
  return searchDirectory(index, parseQuery(s)).length ? s : null;
}

// ---------------------------------------------------------------------------------------------------
// Surlignage

export type Segment = { text: string; hit: boolean };

function segments(text: string, ranges: [number, number][]): Segment[] {
  if (!ranges.length) return text ? [{ text, hit: false }] : [];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  const out: Segment[] = [];
  let at = 0;
  for (const [a, b] of merged) {
    if (a > at) out.push({ text: text.slice(at, a), hit: false });
    out.push({ text: text.slice(a, b), hit: true });
    at = b;
  }
  if (at < text.length) out.push({ text: text.slice(at), hit: false });
  return out;
}

/** Morceaux à surligner dans un texte affiché (nom, groupe…) : chaque occurrence repliée des mots saisis. */
export function highlightText(text: string, q: Query): Segment[] {
  if (!text) return [];
  if (!q.tokens.length) return [{ text, hit: false }];
  const { folded, map } = foldWithMap(text);
  const ranges: [number, number][] = [];
  for (const t of q.tokens) {
    if (t.length < 2 && q.tokens.length > 1) continue;
    let from = 0;
    for (;;) {
      const i = folded.indexOf(t, from);
      if (i < 0) break;
      // Un mot d'une lettre ne surligne qu'un début de mot.
      if (t.length > 1 || i === 0 || folded[i - 1] === " ") {
        const end = map[i + t.length - 1]!;
        ranges.push([map[i]!, end + 1]);
      }
      from = i + t.length;
    }
  }
  return segments(text, ranges);
}

/** Morceaux à surligner dans un numéro : chiffres saisis (numéro entier ou mot de 3 chiffres et plus). */
export function highlightPhone(phone: string, q: Query): Segment[] {
  if (!phone) return [];
  const needles = q.phone ? [q.phone] : q.tokens.filter((t) => /^\d{3,}$/.test(t));
  if (!needles.length) return [{ text: phone, hit: false }];
  const { digits, map } = phoneDigitsWithMap(phone);
  const ranges: [number, number][] = [];
  for (const n of needles) {
    const i = digits.indexOf(n);
    if (i < 0) continue;
    const idx = map.slice(i, i + n.length).filter((v) => v >= 0);
    if (idx.length) ranges.push([idx[0]!, idx[idx.length - 1]! + 1]);
  }
  return segments(phone, ranges);
}

// ---------------------------------------------------------------------------------------------------
// Alias de gare (serveur) : « Chef de gare Mons » se trouve aussi par « FMS » ou « Bergen »

export type StationAliasRef = { abbr?: string; names: string[] };
type AliasIndex = Map<string, { words: string[]; aliases: string[] }[]>;

/** Index des noms de gare par premier mot replié (recherche linéaire évitée : ≈ 800 gares × 400 fiches). */
export function stationAliasIndex(refs: StationAliasRef[]): AliasIndex {
  const idx: AliasIndex = new Map();
  for (const r of refs) {
    const aliases = [r.abbr ?? "", ...r.names].map((s) => s.trim()).filter(Boolean);
    for (const n of r.names) {
      const ws = words(foldText(n));
      if (!ws.length || ws.join("").length < 3) continue;
      const list = idx.get(ws[0]!) ?? [];
      list.push({ words: ws, aliases });
      idx.set(ws[0]!, list);
    }
  }
  return idx;
}

/** Abréviation et autres noms des gares citées dans un nom de contact (mots entiers), sans ceux déjà présents. */
export function stationAliasesFor(name: string, idx: AliasIndex): string[] {
  const folded = foldText(name);
  const ws = words(folded);
  const out = new Set<string>();
  for (let i = 0; i < ws.length; i++)
    for (const cand of idx.get(ws[i]!) ?? [])
      if (cand.words.every((w, k) => ws[i + k] === w))
        for (const a of cand.aliases) if (!folded.includes(foldText(a))) out.add(a);
  return [...out].slice(0, 8);
}

// ---------------------------------------------------------------------------------------------------
// Favoris et récents (préférences de l'agent : `users.preferences.directory`)

export const MAX_FAVORITES = 60;
export const MAX_RECENT = 8;
const ID = /^[a-z0-9]{15}$/;

export type DirectoryPrefs = { favorites: string[]; recent: string[] };

/** Lecture défensive de `preferences.directory` (valeurs inconnues ou mal formées écartées). */
export function readDirectoryPrefs(preferences: unknown): DirectoryPrefs {
  const d =
    preferences && typeof preferences === "object"
      ? (preferences as Record<string, unknown>).directory
      : undefined;
  const list = (v: unknown, max: number) =>
    Array.isArray(v)
      ? [...new Set(v.filter((x): x is string => typeof x === "string" && ID.test(x)))].slice(
          0,
          max,
        )
      : [];
  const o = d && typeof d === "object" ? (d as Record<string, unknown>) : {};
  return { favorites: list(o.favorites, MAX_FAVORITES), recent: list(o.recent, MAX_RECENT) };
}

/** Bascule un favori (ajout en fin de liste ; refus au-delà du maximum : liste inchangée). */
export function toggleFavorite(list: readonly string[], id: string): string[] {
  if (list.includes(id)) return list.filter((x) => x !== id);
  if (list.length >= MAX_FAVORITES) return [...list];
  return [...list, id];
}

/** Fiche consultée : en tête des récents, sans doublon, `MAX_RECENT` au plus. */
export function pushRecent(list: readonly string[], id: string): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, MAX_RECENT);
}
