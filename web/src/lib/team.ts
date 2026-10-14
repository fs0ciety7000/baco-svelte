// Libellés partagés Équipe / Admin (client et serveur).

// Libellés des rôles : collection `roles` (lot L3), voir `lib/roles.ts` (`roleLabel`).

export const DISTRICT_SHORT: Record<string, string> = {
  "Sud-Ouest": "DSO",
  "Sud-Est": "DSE",
  Centre: "DCE",
};

/**
 * Districts de l'agent pour les filtres et alertes par défaut : ceux cochés pour aujourd'hui, sinon ses districts
 * permanents (rôles v2, réglés par l'admin), sinon l'ancien district unique. Miroir de `dutyDistricts` (hooks).
 */
export function userDistricts(
  user: {
    duty_day?: string;
    duty_districts?: string[] | null;
    districts?: string[] | null;
    district?: string;
  },
  today: string,
): string[] {
  if (user.duty_day === today && user.duty_districts?.length) return user.duty_districts;
  if (user.districts?.length) return user.districts;
  return user.district ? [user.district] : [];
}

/** Événement de fenêtre émis après un changement des districts du jour (la cloche se recharge). */
export const DUTY_CHANGED = "csm:duty-changed";

/**
 * Districts du jour modifiés : prévient cet onglet (cloche, puce) et les autres onglets CSM ouverts (BroadcastChannel), qui
 * rafraîchissent leur barre du haut (15 oct. 2026 : un autre onglet gardait l'ancienne puce).
 */
export function announceDutyChange() {
  window.dispatchEvent(new Event(DUTY_CHANGED));
  try {
    const ch = new BroadcastChannel("csm-duty");
    ch.postMessage("changed");
    ch.close();
  } catch {
    // BroadcastChannel absent : cet onglet seulement.
  }
}

/** District principal (bons de commande, feuille de route) : le premier des districts permanents, sinon `district`. */
export function primaryDistrict(user: { districts?: string[] | null; district?: string }): string {
  return user.districts?.[0] || user.district || "";
}

/** Statuts du jour proposés (Journal, Équipe ; demande du 10 oct. 2026). Saisie libre possible (40 caractères). */
export const STATUS_PRESETS = [
  "EXTRA",
  "Pas en service",
  "En pause",
  "Au téléphone",
  "En formation",
] as const;

/** Statut visible seulement le jour où il a été posé (Europe/Brussels). */
export function statusOf(status: string, statusDay: string, today: string): string {
  return status && statusDay === today ? status : "";
}
