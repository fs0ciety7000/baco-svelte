// Libellés partagés Équipe / Admin (client et serveur).

export const ROLE_LABEL: Record<string, string> = {
  admin: "Administrateur",
  sysop: "Sysop",
  moderator: "Modérateur",
  paco: "PACO/RCCA",
  guest: "Invité",
  disabled: "Désactivé",
  connector: "Connecteur",
};

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
