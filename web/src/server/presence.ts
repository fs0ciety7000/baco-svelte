import "server-only";

// Présence en direct (demande du 11 oct. 2026) : un agent est « en ligne » tant qu'il garde au moins un onglet CSM ouvert,
// c'est-à-dire un flux /api/events (la cloche s'y abonne sur toutes les pages du shell). Registre en mémoire du serveur
// Next (une seule instance par environnement sur Coolify) : rien n'est écrit en base, rien n'est conservé.
// Un changement de page rouvre le flux (nouveaux sujets) : la déconnexion n'est comptée qu'après un délai de grâce.

const GRACE_MS = 20_000;

type Entry = { tabs: number; since: number; leftAt: number | null };

// Next charge la route /api/events et les actions serveur dans des copies distinctes de ce module : le registre vit sur
// globalThis pour être partagé (sinon la liste restait vide, constaté sur la préversion le 11 oct.).
type Registry = {
  entries: Map<string, Entry>;
  listeners: Set<() => void>;
  timers: Map<string, ReturnType<typeof setTimeout>>;
};
const KEY = Symbol.for("csm.presence");
const g = globalThis as typeof globalThis & { [KEY]?: Registry };
const registry: Registry = (g[KEY] ??= {
  entries: new Map(),
  listeners: new Set(),
  timers: new Map(),
});
const { entries, listeners, timers } = registry;

function notify() {
  for (const fn of listeners) fn();
}

/** Un onglet de l'agent ouvre son flux. Renvoie la fonction à appeler à la fermeture. */
export function joinPresence(userId: string): () => void {
  const cur = entries.get(userId);
  const wasOnline = !!cur && (cur.tabs > 0 || cur.leftAt !== null);
  const t = timers.get(userId);
  if (t) {
    clearTimeout(t);
    timers.delete(userId);
  }
  entries.set(userId, {
    tabs: (cur?.tabs ?? 0) + 1,
    since: wasOnline && cur ? cur.since : Date.now(),
    leftAt: null,
  });
  if (!wasOnline) notify();
  let left = false;
  return () => {
    if (left) return;
    left = true;
    const e = entries.get(userId);
    if (!e) return;
    e.tabs = Math.max(0, e.tabs - 1);
    if (e.tabs > 0) return;
    e.leftAt = Date.now();
    timers.set(
      userId,
      setTimeout(() => {
        timers.delete(userId);
        const again = entries.get(userId);
        if (again && again.tabs === 0) {
          entries.delete(userId);
          notify();
        }
      }, GRACE_MS),
    );
  };
}

/** Agents en ligne : identifiant et heure d'arrivée (ms). */
export function onlineUsers(): { id: string; since: number }[] {
  return [...entries].map(([id, e]) => ({ id, since: e.since }));
}

/** Prévient à chaque arrivée / départ (pour pousser l'événement « presence » aux navigateurs). */
export function onPresenceChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
