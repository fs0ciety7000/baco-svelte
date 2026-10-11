import { addDays, isValidDay } from "./time";

// Période par défaut de la liste des bons bus (11 oct. 2026) : d'hier à aujourd'hui + 6 jours (7 jours de service
// utiles au quotidien : la veille pour les bons à confirmer, la semaine à venir pour les travaux). Seulement quand
// l'URL ne donne aucune borne : `?du=&au=` (bornes vides explicites) affiche toutes les dates.

export const DEFAULT_PERIOD = { before: 1, after: 6 } as const;

export function defaultBusPeriod(today: string): { du: string; au: string } {
  return { du: addDays(today, -DEFAULT_PERIOD.before), au: addDays(today, DEFAULT_PERIOD.after) };
}

/**
 * Bornes effectives : celles de l'URL si l'une des deux est présente (même vide), sinon la période par défaut.
 * Une borne invalide est ignorée (comme le schéma de la liste).
 */
export function resolveBusPeriod(
  params: { du?: string; au?: string },
  today: string,
): { du: string; au: string; isDefault: boolean } {
  if (params.du === undefined && params.au === undefined)
    return { ...defaultBusPeriod(today), isDefault: true };
  return {
    du: isValidDay(params.du) ? params.du : "",
    au: isValidDay(params.au) ? params.au : "",
    isDefault: false,
  };
}
