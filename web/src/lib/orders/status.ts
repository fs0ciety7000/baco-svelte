// Cycle de vie des commandes (miroir d'affichage de pocketbase/pb_hooks/lib/orders.js, qui fait foi). Cycle v3,
// décision de l'utilisateur du 14 oct. 2026 :
//   1. « Brouillon / en cours » (bon préparé, bus engagés) ;
//   2. « Terminé » (le ou les bus sont démobilisés) ;
//   3. « Envoyé / finalisé » (clôture : e-mail semi-automatique au fournisseur, PDF archivé).
// Plus annulé. « Confirmé » et « En cours » n'existent plus (migration `1760003400`).

export const ORDER_STATUSES = ["brouillon", "termine", "envoye", "annule"] as const;
export type Status = (typeof ORDER_STATUSES)[number];
export type OrderKind = "bus" | "taxi";

export const STATUS_LABEL: Record<Status, string> = {
  brouillon: "Brouillon / en cours",
  termine: "Terminé",
  envoye: "Envoyé / finalisé",
  annule: "Annulé",
};

const TRANSITIONS: Record<Status, Status[]> = {
  brouillon: ["termine", "annule"],
  termine: ["envoye", "brouillon", "annule"],
  envoye: [],
  annule: [],
};
// Rouvrir un bon finalisé : coordinateurs (dont les PACO/RCCA, décision du 11 oct. 2026).
const COORDINATOR: Partial<Record<Status, Status[]>> = {
  envoye: ["termine"],
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
  "brouillon>termine": { label: "Terminer (bus démobilisés)", primary: true },
  "termine>envoye": { label: "Valider l'envoi", primary: true },
  "termine>brouillon": { label: "Revenir en cours", tone: "back" },
  "envoye>termine": { label: "Rouvrir", tone: "back" },
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

/** Libellé d'un statut de l'historique : y compris les statuts retirés en v3 (« Confirmé », « En cours »). */
export function historyLabel(code: string): string {
  if (isStatus(code)) return STATUS_LABEL[code];
  return ({ confirme: "Confirmé", en_cours: "En cours" } as Record<string, string>)[code] ?? code;
}

export function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (ORDER_STATUSES as readonly string[]).includes(v);
}

export function isCoordinator(role: string): boolean {
  // Rôles v2 (11 oct. 2026) : les PACO/RCCA ont les droits des anciens coordinateurs (miroir de `lib/orders.js`).
  return role === "admin" || role === "sysop" || role === "moderator" || role === "paco";
}

/** Une commande se modifie tant qu'elle n'est pas annulée (un bon finalisé se rouvre d'abord). */
export function isEditable(status: Status): boolean {
  return status !== "annule" && status !== "envoye";
}

/** Action principale de la barre (une seule en mobile, pleine largeur). */
export type MainAction =
  { type: "send" } | { type: "create" } | { type: "transition"; t: Transition } | null;

/**
 * Choix de l'action principale : « Valider l'envoi » (bon terminé), « Créer le bon » (bon neuf), la transition principale
 * (Terminer, Rétablir), sinon la première transition de retour (Rouvrir, Revenir en cours). Jamais l'annulation.
 * Sert à la barre d'actions des bons (`OrderActionBar`, refonte R6).
 */
export function mainActionOf(opts: {
  canSend: boolean;
  canCreate: boolean;
  transitions: Transition[];
}): MainAction {
  if (opts.canSend) return { type: "send" };
  if (opts.canCreate) return { type: "create" };
  const primary = opts.transitions.find((t) => t.primary);
  if (primary) return { type: "transition", t: primary };
  const back = opts.transitions.find((t) => t.tone !== "danger");
  return back ? { type: "transition", t: back } : null;
}
