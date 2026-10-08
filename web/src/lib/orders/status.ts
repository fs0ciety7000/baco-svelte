// Cycle de vie des commandes (miroir d'affichage de pocketbase/pb_hooks/lib/orders.js, qui fait foi).
// brouillon → envoyé → confirmé → en cours → terminé, ou annulé. Pas de « facturé » (décision du 8 oct. 2026).

export const ORDER_STATUSES = [
  "brouillon",
  "envoye",
  "confirme",
  "en_cours",
  "termine",
  "annule",
] as const;
export type Status = (typeof ORDER_STATUSES)[number];
export type OrderKind = "bus" | "taxi";

export const STATUS_LABEL: Record<Status, string> = {
  brouillon: "Brouillon",
  envoye: "Envoyé",
  confirme: "Confirmé",
  en_cours: "En cours",
  termine: "Terminé",
  annule: "Annulé",
};

const TRANSITIONS: Record<Status, Status[]> = {
  brouillon: ["envoye", "annule"],
  envoye: ["brouillon", "confirme", "annule"],
  confirme: ["envoye", "en_cours", "termine", "annule"],
  en_cours: ["confirme", "termine"],
  termine: [],
  annule: [],
};
const COORDINATOR: Partial<Record<Status, Status[]>> = {
  en_cours: ["annule"],
  termine: ["en_cours"],
};

export type Transition = {
  to: Status;
  label: string;
  /** Action principale (une seule par statut). */
  primary?: boolean;
  /** Retour en arrière ou annulation : présenté en second. */
  tone?: "back" | "danger";
};

const ACTION: Record<string, Omit<Transition, "to">> = {
  "brouillon>envoye": { label: "Marquer envoyé", primary: true },
  "envoye>confirme": { label: "Confirmer", primary: true },
  "envoye>brouillon": { label: "Revenir en brouillon", tone: "back" },
  "confirme>en_cours": { label: "Démarrer", primary: true },
  "confirme>termine": { label: "Terminer" },
  "confirme>envoye": { label: "Annuler la confirmation", tone: "back" },
  "en_cours>termine": { label: "Terminer", primary: true },
  "en_cours>confirme": { label: "Revenir à confirmé", tone: "back" },
  "termine>en_cours": { label: "Rouvrir", tone: "back" },
};

/** Transitions proposées à un agent (le serveur revérifie tout). */
export function transitionsFor(
  status: Status,
  opts: { coordinator: boolean; statusBeforeCancel?: string },
): Transition[] {
  const targets = [
    ...TRANSITIONS[status],
    ...(opts.coordinator ? (COORDINATOR[status] ?? []) : []),
  ];
  const list: Transition[] = targets.map((to) =>
    to === "annule"
      ? { to, label: "Annuler la commande", tone: "danger" }
      : { to, ...(ACTION[`${status}>${to}`] ?? { label: STATUS_LABEL[to] }) },
  );
  if (status === "annule" && opts.coordinator && isStatus(opts.statusBeforeCancel)) {
    list.push({ to: opts.statusBeforeCancel, label: "Rétablir", primary: true });
  }
  return list;
}

export function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (ORDER_STATUSES as readonly string[]).includes(v);
}

export function isCoordinator(role: string): boolean {
  return role === "admin" || role === "sysop" || role === "moderator";
}

/** Une commande se modifie jusqu'à « terminé » sans « déverrouiller » ; annulée = lecture seule. */
export function isEditable(status: Status): boolean {
  return status !== "annule";
}
