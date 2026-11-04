// Synchro automatique par l'extension (demande du 4 nov. 2026 : « si je ne suis pas disponible, les collègues ne pourront
// pas le faire ») : CSM décide QUOI synchroniser, l'extension de n'importe quel agent connecté qui a un onglet DICOS ou
// Quinyx ouvert l'exécute sans clic. Logique pure (testée) : liste des tâches selon la fraîcheur des dernières synchros,
// baux (un seul poste à la fois par tâche), résultat des derniers passages. Aucune donnée nominative.

export type TaskKind = "dicos" | "quinyx";

export type ConnectorTask = {
  /** « dicos:AAAA-MM-JJ » ou « quinyx ». */
  id: string;
  kind: TaskKind;
  /** Jour DICOS à synchroniser (AAAA-MM-JJ) ; absent pour Quinyx. */
  day?: string;
  /** Phrase courte pour le popup (« DICOS aujourd'hui : dernière synchro il y a 42 min »). */
  reason: string;
};

/** Seuils : DICOS du jour 30 min, DICOS du lendemain 2 h, Quinyx 3 h. */
export const FRESHNESS = { dicosToday: 30, dicosTomorrow: 120, quinyx: 180 } as const;
/** Durée d'un bail : une tâche réservée par un poste n'est pas proposée aux autres pendant ce temps. */
export const LEASE_MINUTES = 10;
/** Intervalle conseillé à l'extension entre deux demandes (minutes). */
export const POLL_MINUTES = 5;

export type Freshness = {
  /** Heure (0-23, Bruxelles) : hors des heures de service, rien n'est demandé. */
  hour: number;
  today: string;
  tomorrow: string;
  /** Dernière synchro DICOS COMPLÈTE (missions) par jour, ou null si aucune. */
  dicos: Record<string, Date | null>;
  /** Dernière synchro Quinyx réussie (le plus ancien des groupes activés), null si jamais ; `undefined` = aucun groupe. */
  quinyx: Date | null | undefined;
  now: Date;
  /** Plage horaire « 0-24 » par défaut (l'équipe travaille 24 h / 24) ; `null` = coupée. */
  hours?: { from: number; to: number } | null;
};

const ageMinutes = (d: Date | null, now: Date) =>
  d ? Math.max(0, Math.round((now.getTime() - d.getTime()) / 60_000)) : null;

function ago(min: number | null): string {
  if (min === null) return "jamais synchronisé";
  if (min < 60) return `dernière synchro il y a ${min} min`;
  return `dernière synchro il y a ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
}

/** « 6-22 » → { from: 6, to: 22 } ; « off » → null (synchro automatique coupée) ; absent ou invalide → 0-24. */
export function parseHours(raw: string | undefined): { from: number; to: number } | null {
  const v = String(raw ?? "0-24").trim();
  if (v === "off") return null;
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(v);
  if (!m || +m[1]! >= +m[2]! || +m[2]! > 24) return { from: 0, to: 24 };
  return { from: +m[1]!, to: +m[2]! };
}

/** Tâches à faire maintenant (DICOS aujourd'hui, DICOS demain, Quinyx), selon la fraîcheur. */
export function computeTasks(f: Freshness): ConnectorTask[] {
  const hours = f.hours === undefined ? { from: 0, to: 24 } : f.hours;
  if (!hours || f.hour < hours.from || f.hour >= hours.to) return [];
  const out: ConnectorTask[] = [];
  const day = (d: string, limit: number, label: string) => {
    const age = ageMinutes(f.dicos[d] ?? null, f.now);
    if (age === null || age >= limit)
      out.push({ id: `dicos:${d}`, kind: "dicos", day: d, reason: `DICOS ${label} : ${ago(age)}` });
  };
  day(f.today, FRESHNESS.dicosToday, "aujourd'hui");
  day(f.tomorrow, FRESHNESS.dicosTomorrow, "demain");
  if (f.quinyx !== undefined) {
    const age = ageMinutes(f.quinyx, f.now);
    if (age === null || age >= FRESHNESS.quinyx)
      out.push({ id: "quinyx", kind: "quinyx", reason: `Quinyx : ${ago(age)}` });
  }
  return out;
}

export type Lease = { holder: string; until: number };
export type LeaseStore = Map<string, Lease>;

/** Réserve une tâche pour `holder` ; refusée si un autre poste la tient encore. Le même poste peut la reprendre. */
export function claimLease(store: LeaseStore, id: string, holder: string, now: number): boolean {
  const cur = store.get(id);
  if (cur && cur.until > now && cur.holder !== holder) return false;
  store.set(id, { holder, until: now + LEASE_MINUTES * 60_000 });
  return true;
}

/** Libère la tâche (seulement si `holder` la tient). */
export function releaseLease(store: LeaseStore, id: string, holder: string): void {
  if (store.get(id)?.holder === holder) store.delete(id);
}

/** Tâches libres pour `holder` : celles qu'aucun autre poste n'a réservées. */
export function freeTasks(
  tasks: ConnectorTask[],
  store: LeaseStore,
  holder: string,
  now: number,
): ConnectorTask[] {
  return tasks.filter((t) => {
    const l = store.get(t.id);
    return !l || l.until <= now || l.holder === holder;
  });
}

/** Résultat d'un passage, rapporté par l'extension. `code` : no-dicos, no-quinyx, session, busy, csm, error. */
export type TaskOutcome = {
  id: string;
  kind: TaskKind;
  ok: boolean;
  code: string;
  at: number;
  /** Propriétaire du jeton (id d'agent) ; vide pour le secret partagé. */
  by: string;
  version: string;
};

export const OUTCOME_CODES = [
  "ok",
  "no-dicos",
  "no-quinyx",
  "session",
  "busy",
  "csm",
  "error",
] as const;

/** Phrase de l'état du poste automatique (écran /tv, popup) à partir du dernier passage d'un type. */
export function outcomeText(o: TaskOutcome | null | undefined): string {
  if (!o) return "aucun passage automatique";
  switch (o.code) {
    case "ok":
      return "synchronisé automatiquement";
    case "no-dicos":
      return "aucun onglet DICOS ouvert sur les postes connectés";
    case "no-quinyx":
      return "aucun onglet Quinyx ouvert sur les postes connectés";
    case "session":
      return "session à rafraîchir : recharge l'onglet (F5) ou reconnecte-toi";
    case "busy":
      return "une synchro était déjà en cours";
    case "csm":
      return "CSM injoignable depuis le poste";
    default:
      return "échec de la synchro automatique";
  }
}

/** État des synchros pour l'écran commun (sans nom). */
export type SyncHealth = {
  dicos: { at: string | null; tomorrowAt: string | null };
  quinyx: { at: string | null; enabled: boolean };
  /** Dernier passage automatique par type (aucun nom : `by` est un identifiant, non renvoyé). */
  auto: {
    dicos: { at: string; ok: boolean; code: string } | null;
    quinyx: { at: string; ok: boolean; code: string } | null;
  };
  pending: { id: string; reason: string }[];
};
