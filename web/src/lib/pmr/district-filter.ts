import { districtTokens, isAllDistricts, type DistrictParam } from "../district-param";
import { DISTRICTS } from "./districts";

// Filtre district des Missions PMR et des Groupes (11 oct. 2026) : un ou plusieurs codes (« DSO », « DSO,DSE »).
// Sans paramètre d'URL, le filtre par défaut = districts du jour de l'agent ; « tous » (ou une valeur vide) lève le
// filtre. L'URL explicite l'emporte toujours.

const NAME_TO_CODE: Record<string, string> = {
  "Sud-Ouest": "DSO",
  "Sud-Est": "DSE",
  Centre: "DCE",
};

/**
 * Codes valides d'une valeur de filtre, sans doublon, dans l'ordre DCE, DSE, DSO ; chaîne vide = tous. Accepte aussi
 * le paramètre répété (`?district=DSO&district=DSE`, refonte R4) et les noms (« Sud-Ouest »).
 */
export function normalizeDistricts(value: DistrictParam): string {
  const set = new Set(districtTokens(value).map((s) => NAME_TO_CODE[s] ?? s.toUpperCase()));
  return DISTRICTS.filter((d) => set.has(d)).join(",");
}

/** Codes d'un filtre normalisé (« DSO,DSE » → ["DSE", "DSO"]). */
export const districtCodes = (filter: string): string[] =>
  normalizeDistricts(filter).split(",").filter(Boolean);

/** Vrai si le district d'une gare passe le filtre (filtre vide : tout passe). */
export function inDistricts(district: string, filter: string): boolean {
  if (!filter) return true;
  return districtCodes(filter).includes(district);
}

/**
 * Filtre effectif d'une page : paramètre d'URL s'il est présent (« tous » ou vide = tous les districts), sinon les
 * districts du jour de l'agent (noms « Sud-Ouest »… convertis en codes).
 */
export function effectiveDistricts(param: DistrictParam, dayDistricts: string[]): string {
  if (param !== undefined && param !== null)
    return isAllDistricts(param) ? "" : normalizeDistricts(param);
  return normalizeDistricts(dayDistricts.map((n) => NAME_TO_CODE[n] ?? n).join(","));
}

/** Libellé court d'un filtre (« DSE + DSO »). */
export const districtsLabel = (filter: string): string => districtCodes(filter).join(" + ");
