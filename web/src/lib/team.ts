// Libellés partagés Équipe / Admin (client et serveur).

export const ROLE_LABEL: Record<string, string> = {
  admin: "Administrateur",
  sysop: "Sysop",
  moderator: "Coordinateur",
  otto_agent: "Agent Otto",
  user: "Agent",
  reader: "Lecteur",
  disabled: "Désactivé",
  connector: "Connecteur",
};

export const DISTRICT_SHORT: Record<string, string> = {
  "Sud-Ouest": "DSO",
  "Sud-Est": "DSE",
  Centre: "DCE",
};

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
