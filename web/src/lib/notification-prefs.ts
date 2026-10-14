// Catégories de notifications affichables / masquables depuis le profil (demande du 14 oct. 2026). Préférence du compte :
// `users.preferences.notifications.hidden` (liste des catégories masquées). Une catégorie masquée disparaît de la cloche,
// du compteur et des notifications du navigateur ; les autres restent triées par districts du jour.

export const NOTIFICATION_CATEGORIES = [
  { id: "urgent", label: "Urgences du Journal", hint: "Messages urgents de tes districts." },
  {
    id: "mention",
    label: "Mentions",
    hint: "Quand on te mentionne ou qu'on mentionne ton district (@DSO…).",
  },
  {
    id: "perturbation",
    label: "Perturbations iRail",
    hint: "Incidents et rétablissements dans tes districts.",
  },
  { id: "travaux", label: "Travaux iRail", hint: "Travaux annoncés dans tes districts." },
  {
    id: "train",
    label: "Retards des trains",
    hint: "Trains des missions PMR et des groupes, trains que tu suis.",
  },
  {
    id: "dicos",
    label: "Changements DICOS",
    hint: "Missions et groupes ajoutés, annulés ou déplacés dans les 3 h.",
  },
  { id: "systeme", label: "Alertes système", hint: "Synchro DICOS en retard, maintenance…" },
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]["id"];

const IDS = new Set<string>(NOTIFICATION_CATEGORIES.map((c) => c.id));

/** Titre d'une notification de travaux iRail (« Travaux (Sud-Ouest) : … », posé par le hook `irailJournal`). */
export const TRAVAUX_TITLE = "Travaux (";

/** Catégories masquées lues dans les préférences (valeurs inconnues ignorées). */
export function hiddenCategories(preferences: unknown): NotificationCategory[] {
  const p =
    preferences && typeof preferences === "object" ? (preferences as Record<string, unknown>) : {};
  const n =
    p.notifications && typeof p.notifications === "object"
      ? (p.notifications as Record<string, unknown>)
      : {};
  const list = Array.isArray(n.hidden) ? n.hidden : [];
  return [
    ...new Set(list.filter((x): x is NotificationCategory => typeof x === "string" && IDS.has(x))),
  ];
}

/**
 * Clauses de filtre PocketBase qui excluent les catégories masquées (toutes constantes : aucune saisie de l'agent).
 * Perturbations et travaux partagent le type `perturbation` et se distinguent par le titre.
 */
export function hiddenFilter(hidden: readonly NotificationCategory[]): string {
  const h = new Set(hidden);
  const out: string[] = [];
  for (const k of ["urgent", "mention", "train", "dicos", "systeme"] as const)
    if (h.has(k)) out.push(`kind != "${k}"`);
  if (h.has("perturbation") && h.has("travaux")) out.push('kind != "perturbation"');
  else if (h.has("perturbation"))
    out.push(`(kind != "perturbation" || title ~ "${TRAVAUX_TITLE}")`);
  else if (h.has("travaux")) out.push(`(kind != "perturbation" || title !~ "${TRAVAUX_TITLE}")`);
  return out.join(" && ");
}
