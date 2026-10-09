// « Masquer les annulées » mémorisé dans les préférences de l'agent (users.preferences.pmr.cancelled, demande du
// 9 oct. 2026) : le paramètre d'URL `annulees` (masquees / affichees) l'emporte et devient le nouveau choix ; sans lui,
// Missions PMR, Groupes et Historique reprennent le dernier choix, sur tous les postes de l'agent.

export type CancelledPref = "masquees" | "affichees";

export const isCancelledPref = (v: unknown): v is CancelledPref =>
  v === "masquees" || v === "affichees";

/** Choix mémorisé lu dans `users.preferences`. */
export function storedCancelledPref(preferences: unknown): CancelledPref | undefined {
  const v = (preferences as { pmr?: { cancelled?: unknown } } | null | undefined)?.pmr?.cancelled;
  return isCancelledPref(v) ? v : undefined;
}

export function cancelledPref(
  param: string | undefined,
  stored: string | undefined,
): CancelledPref {
  if (isCancelledPref(param)) return param;
  return stored === "masquees" ? "masquees" : "affichees";
}
