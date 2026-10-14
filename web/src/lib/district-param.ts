// Paramètre d'URL `district` à plusieurs valeurs (refonte R4, 14 oct. 2026 : filtres multi-districts partout).
// Formes acceptées : répété (`?district=DSO&district=DSE`, envoyé par `DistrictPicker` / `MultiSelect`), liste
// (« DSO,DSE », anciens liens) ou valeur unique. « tous » (ou vide) = aucun filtre. Codes et noms se valent
// (« DSO » = « Sud-Ouest ») : chaque page garde sa forme stockée (codes pour les gares et missions, noms pour les bons
// et les comptes). Logique pure, partagée par les pages serveur et testée.

export type DistrictParam = string | string[] | null | undefined;

const CODE_TO_NAME: Record<string, string> = {
  DSO: "Sud-Ouest",
  DSE: "Sud-Est",
  DCE: "Centre",
  DNO: "Nord-Ouest",
  DNE: "Nord-Est",
};
const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(CODE_TO_NAME).map(([c, n]) => [n.toLowerCase(), c]),
);

/** Jetons bruts du paramètre (répété et / ou séparé par des virgules), sans vide. */
export function districtTokens(raw: DistrictParam): string[] {
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  return list
    .flatMap((v) => String(v).split(","))
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Vrai si le paramètre lève explicitement le filtre (« tous »), ou s'il est présent mais vide. */
export function isAllDistricts(raw: DistrictParam): boolean {
  if (raw === undefined || raw === null) return false;
  const t = districtTokens(raw);
  return t.length === 0 || t.some((s) => s.toLowerCase() === "tous");
}

/**
 * Valeurs reconnues dans `allowed` (dans l'ordre de `allowed`, sans doublon). Un code vaut son nom et
 * inversement ; la casse est ignorée ; les valeurs inconnues sont écartées.
 */
export function parseDistricts(raw: DistrictParam, allowed: readonly string[]): string[] {
  const wanted = new Set<string>();
  for (const t of districtTokens(raw)) {
    const low = t.toLowerCase();
    wanted.add(low);
    const asName = CODE_TO_NAME[t.toUpperCase()];
    if (asName) wanted.add(asName.toLowerCase());
    const asCode = NAME_TO_CODE[low];
    if (asCode) wanted.add(asCode.toLowerCase());
  }
  return allowed.filter((a) => wanted.has(a.toLowerCase()));
}

/** Filtre PocketBase lié : `champ = v1 || champ = v2…` sur un ou plusieurs champs ; vide sans valeur. */
export function anyDistrictFilter(
  pb: { filter(expr: string, params?: Record<string, unknown>): string },
  fields: string | string[],
  values: readonly string[],
  op: "=" | "~" = "=",
): string {
  const fs = Array.isArray(fields) ? fields : [fields];
  const params: Record<string, string> = {};
  const ors: string[] = [];
  values.forEach((v, i) => {
    params[`dv${i}`] = v;
    for (const f of fs) ors.push(`${f} ${op} {:dv${i}}`);
  });
  return ors.length ? pb.filter(`(${ors.join(" || ")})`, params) : "";
}

/** Paramètres d'URL répétés pour une liste de districts (liens des raccourcis, exports). */
export function appendDistricts(p: URLSearchParams, values: readonly string[], key = "district") {
  for (const v of values) p.append(key, v);
  return p;
}

// Options des puces `DistrictPicker` (ici et pas dans le composant client : une page serveur les passe en props).

export type DistrictOption = { value: string; label: string; hint?: string };

/** Codes (filtres des Missions PMR, Ma journée, Ressources…). */
export const DISTRICT_CODE_OPTIONS: DistrictOption[] = [
  { value: "DSO", label: "DSO", hint: "Sud-Ouest" },
  { value: "DSE", label: "DSE", hint: "Sud-Est" },
  { value: "DCE", label: "DCE", hint: "Centre" },
];

/** Noms (bons de commande, comptes, districts du jour) : même rendu, valeur = nom. */
export const DISTRICT_NAME_OPTIONS: DistrictOption[] = [
  { value: "Sud-Ouest", label: "DSO", hint: "Sud-Ouest" },
  { value: "Sud-Est", label: "DSE", hint: "Sud-Est" },
  { value: "Centre", label: "DCE", hint: "Centre" },
];
