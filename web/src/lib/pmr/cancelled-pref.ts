// « Masquer les annulées » mémorisé (demande du 9 oct. 2026) : le paramètre d'URL `annulees` (masquees / affichees)
// l'emporte ; sans lui, le dernier choix de l'agent, gardé dans un cookie posé par le middleware à chaque bascule.

export const CANCELLED_COOKIE = "csm_annulees";
export type CancelledPref = "masquees" | "affichees";

export const isCancelledPref = (v: unknown): v is CancelledPref =>
  v === "masquees" || v === "affichees";

export function cancelledPref(
  param: string | undefined,
  cookie: string | undefined,
): CancelledPref {
  if (isCancelledPref(param)) return param;
  return cookie === "masquees" ? "masquees" : "affichees";
}
