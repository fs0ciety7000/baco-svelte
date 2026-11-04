// « Vu » de la file « À traiter » de l'accueil (4 nov. 2026, demande de l'utilisateur) : une alerte sans traitement possible
// (train supprimé, retard, consigne épinglée) reste sinon affichée toute la journée. L'agent la masque pour lui seul ; la clé
// porte l'état de l'alerte, donc une aggravation (retard qui passe un palier, train supprimé) la fait réapparaître.
// Stockage : `users.preferences.todoSeen` = { clé: instant ISO }, élagué à 2 jours. Pur (partagé client / serveur).

/** Durée de vie d'une clé « vu » : au-delà, elle est oubliée (les alertes sont du jour). */
export const SEEN_TTL_MS = 2 * 24 * 60 * 60 * 1000;
/** Nombre maximal de clés gardées (les plus récentes). */
export const SEEN_MAX = 300;

export type TodoSeen = Record<string, string>;

/** Clé valide : préfixe connu, caractères sûrs, bornée (revérifiée par la Server Action). */
export const SEEN_KEY_RE = /^(impact|pin):[A-Za-z0-9:._-]{1,120}$/;

/**
 * Palier de l'état d'un train : « supprimé », ou retard arrondi au palier (5, 15, 30, 60 min). Un retard qui grandit dans
 * le même palier reste « vu » ; un palier franchi ou une suppression le fait revenir.
 */
export function impactState(impact: { delay: number; cancelled: boolean }): string {
  if (impact.cancelled) return "supprime";
  const d = impact.delay;
  return d >= 60 ? "r60" : d >= 30 ? "r30" : d >= 15 ? "r15" : "r5";
}

/** Clé « vu » d'une prise en charge touchée par un train : mission + jour + train + état. */
export function impactSeenKey(
  m: { id: string; train: string; impact: { delay: number; cancelled: boolean } },
  day: string,
): string {
  const train = m.train.replace(/[^A-Za-z0-9]/g, "") || "x";
  return `impact:${m.id}:${day}:${train}:${impactState(m.impact)}`;
}

/** Clé « vu » d'une consigne épinglée du Journal. */
export function pinSeenKey(id: string): string {
  return `pin:${id}`;
}

/** Lit `preferences.todoSeen` en écartant les clés invalides ou périmées. */
export function readTodoSeen(prefs: unknown, now: number = Date.now()): TodoSeen {
  const raw =
    prefs && typeof prefs === "object" ? (prefs as { todoSeen?: unknown }).todoSeen : undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: TodoSeen = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!SEEN_KEY_RE.test(k) || typeof v !== "string") continue;
    const t = Date.parse(v);
    if (Number.isNaN(t) || now - t > SEEN_TTL_MS) continue;
    out[k] = v;
  }
  return out;
}

/** Marque (`seen` vrai) ou démarque une clé ; élague les clés périmées et garde les `SEEN_MAX` plus récentes. */
export function updateTodoSeen(
  current: TodoSeen,
  key: string,
  seen: boolean,
  now: number = Date.now(),
): TodoSeen {
  const next: TodoSeen = { ...readTodoSeen({ todoSeen: current }, now) };
  if (seen) next[key] = new Date(now).toISOString();
  else delete next[key];
  const entries = Object.entries(next);
  if (entries.length <= SEEN_MAX) return next;
  return Object.fromEntries(entries.sort((a, b) => b[1].localeCompare(a[1])).slice(0, SEEN_MAX));
}

/** Sépare les éléments visibles de ceux que l'agent a déjà vus (`seenKey` absent = toujours visible). */
export function splitSeen<T extends { seenKey?: string }>(
  items: T[],
  seen: TodoSeen | ReadonlySet<string>,
): { visible: T[]; hidden: T[] } {
  const has = (k: string) => (seen instanceof Set ? seen.has(k) : k in (seen as TodoSeen));
  const visible: T[] = [];
  const hidden: T[] = [];
  for (const it of items) (it.seenKey && has(it.seenKey) ? hidden : visible).push(it);
  return { visible, hidden };
}
