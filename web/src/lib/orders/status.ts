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
  opts: { coordinator: boolean; statusBeforeCancel?: string; kind?: OrderKind },
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
  // Taxi : pas de bus à démobiliser (retour du 14 oct. 2026) → « Terminer » tout court.
  if (opts.kind === "taxi")
    for (const t of list) if (status === "brouillon" && t.to === "termine") t.label = "Terminer";
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

/**
 * Droit de rouvrir un bon envoyé / rétablir un annulé (rôles v3, lot L2) : `bus:reopen` ou `taxi:reopen` (PACO/RCCA,
 * Modérateur, admins par défaut). Miroir de `isCoordinator` (pocketbase/pb_hooks/lib/orders.js), qui fait foi.
 */
export function reopenPermission(kind: OrderKind): "bus:reopen" | "taxi:reopen" {
  return kind === "taxi" ? "taxi:reopen" : "bus:reopen";
}

/** Fenêtre pendant laquelle le créateur d'un bon peut le supprimer (miroir de `DELETE_WINDOW_MS`, lib/orders.js). */
export const ORDER_DELETE_WINDOW_MS = 8 * 3600 * 1000;

/**
 * Suppression d'un bon (14 oct. 2026) — miroir d'affichage de `checkDelete` (hook) et de la règle `1760004410` :
 * droit de suppression du module (`otto:delete` / `generate_taxi:delete` : Modérateur, admins), OU créateur du bon avec
 * le droit d'écriture du module, pendant 8 h après la création, tant que le bon n'est pas envoyé / finalisé.
 */
export function canDeleteOrder(
  can: (permission: string) => boolean,
  userId: string,
  order: { kind: OrderKind; created_by: string; created: string; status: string },
  now: number = Date.now(),
): boolean {
  const mod = order.kind === "taxi" ? "generate_taxi" : "otto";
  if (can(`${mod}:delete`)) return true;
  if (!can(`${mod}:write`) || !userId || order.created_by !== userId) return false;
  if (order.status === "envoye") return false;
  const created = Date.parse(order.created.replace(" ", "T"));
  return Number.isFinite(created) && now - created <= ORDER_DELETE_WINDOW_MS;
}

/**
 * Suppression proposée à l'agent : `null` si refusée ; sinon `until` = fin de la fenêtre de 8 h du créateur (ISO), ou
 * `null` quand le droit de suppression du module la permet sans limite. Même règle que `canDeleteOrder`.
 */
export function orderDeletion(
  can: (permission: string) => boolean,
  userId: string,
  order: { kind: OrderKind; created_by: string; created: string; status: string },
  now: number = Date.now(),
): { until: string | null } | null {
  if (!canDeleteOrder(can, userId, order, now)) return null;
  const mod = order.kind === "taxi" ? "generate_taxi" : "otto";
  if (can(`${mod}:delete`)) return { until: null };
  const created = Date.parse(order.created.replace(" ", "T"));
  return { until: new Date(created + ORDER_DELETE_WINDOW_MS).toISOString() };
}

/** « 7h05 » : temps restant avant `until` (ISO) ; vide si dépassé. */
export function remainingLabel(until: string, now: number = Date.now()): string {
  const ms = Date.parse(until) - now;
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const minutes = Math.ceil(ms / 60_000);
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
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
