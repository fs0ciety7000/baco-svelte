// Recherche de gare tolérante (demande du 11 oct. 2026) : accents, casse et ponctuation ignorés, abréviation PtCar
// acceptée (« FMS » → « Mons »). Logique pure, partagée par les filtres (Missions PMR, Groupes, Commandes, Ma journée,
// Ressources) et la palette ⌘K.
//
// PocketBase compare avec `~` (LIKE SQLite) : insensible à la casse pour l'ASCII seulement, et sensible aux accents
// (« liege » ne trouve pas « Liège »). Le serveur résout donc d'abord la saisie en NOMS candidats tirés des
// référentiels (PtCar, gares des lignes), puis filtre par ces noms (`stationTerms`).

/** Forme repliée d'un nom de gare : minuscules, sans accent, ponctuation et tirets → espace simple. */
export function foldStation(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Forme compacte (sans espace) : « Bruxelles-Midi », « bruxelles midi » et « BruxellesMidi » se rejoignent. */
const compact = (s: string) => foldStation(s).replace(/ /g, "");

/** Entrée de référentiel : abréviation PtCar facultative + noms (FR, NL, nom des lignes…). */
export type StationRef = { abbr?: string; names: string[] };

/** Vrai si le nom de gare contient la saisie (accents, casse et ponctuation ignorés). */
export function stationMatches(name: string, query: string): boolean {
  const q = compact(query);
  if (!q) return true;
  return compact(name).includes(q);
}

/**
 * Noms candidats pour une saisie, du plus sûr au moins sûr : abréviation PtCar exacte, puis nom qui commence par la
 * saisie, puis nom qui la contient. Sans doublon (comparaison repliée), `max` au plus.
 */
export function stationCandidates(
  query: string,
  refs: StationRef[],
  max = 12,
  /** Vrai : renvoie le nom retenu de chaque gare (son premier nom : FR) même si la saisie correspond au nom NL ou à un
   * alias (« Bergen » → « Mons ») — champ de gare des bons. Faux : chaque nom qui correspond (termes de filtre). */
  canonical = false,
): string[] {
  const q = compact(query);
  if (q.length < 2) return [];
  const exact: string[] = [];
  const prefix: string[] = [];
  const inner: string[] = [];
  const upper = query.trim().toUpperCase();
  for (const r of refs) {
    const names = r.names.filter(Boolean);
    if (!names.length) continue;
    if (r.abbr && r.abbr.toUpperCase() === upper) {
      exact.push(...(canonical ? [names[0]!] : names));
      continue;
    }
    let best = 2;
    for (const n of names) {
      const c = compact(n);
      if (!c) continue;
      const rank = c.startsWith(q) ? 0 : c.includes(q) ? 1 : 2;
      if (!canonical) {
        if (rank === 0) prefix.push(n);
        else if (rank === 1) inner.push(n);
      } else best = Math.min(best, rank);
    }
    if (canonical && best < 2) (best === 0 ? prefix : inner).push(names[0]!);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of [...exact, ...prefix.sort(byLength), ...inner.sort(byLength)]) {
    const k = foldStation(n);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Nom retenu (premier nom de la gare : FR) pour une saisie qui correspond exactement à l'un de ses noms (accents, casse,
 * tirets ignorés ; nom NL ou alias acceptés : « Bergen » → « Mons », « Maubeuge » → « Maubeuge (FR) ») ou à son
 * abréviation PtCar ; sinon la saisie telle quelle (saisie libre permise).
 */
export function canonicalStation(value: string, refs: StationRef[]): string {
  const v = value.trim();
  const f = foldStation(v);
  if (!f) return value;
  const first = refs.find((r) => r.names[0] && foldStation(r.names[0]) === f);
  if (first) return first.names[0]!;
  const any = refs.find((r) => r.names[0] && r.names.some((n) => foldStation(n) === f));
  if (any) return any.names[0]!;
  const upper = v.toUpperCase();
  const abbr = refs.find((r) => r.names[0] && r.abbr?.toUpperCase() === upper);
  return abbr ? abbr.names[0]! : value;
}

const byLength = (a: string, b: string) => a.length - b.length || a.localeCompare(b, "fr");

/**
 * Termes à passer au filtre `~` de PocketBase : la saisie telle quelle d'abord (une gare absente des référentiels
 * reste trouvable), puis les candidats. Sans doublon insensible à la casse, `max` au plus.
 */
export function stationTerms(query: string, candidates: string[], max = 12): string[] {
  const raw = query.trim();
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [raw, ...candidates]) {
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Vrai si le nom de gare correspond à l'un des termes (saisie ou candidats), par forme repliée. */
export function stationMatchesAny(name: string, terms: string[]): boolean {
  if (terms.length === 0) return true;
  return terms.some((t) => stationMatches(name, t));
}
