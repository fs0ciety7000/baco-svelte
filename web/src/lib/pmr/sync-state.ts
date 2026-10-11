// État de synchro DICOS d'une période (fiabilité, 10 oct. 2026). Pur : testé, utilisé par `dicosSyncState`.
// - Un jour est couvert s'il a reçu un dernier lot (`complete`).
// - Fraîcheur = celle du jour couvert le MOINS récemment synchronisé de la période : « synchronisé il y a 5 min » ne
//   doit pas masquer un autre jour affiché synchronisé hier.
// - Synchro en cours / interrompue : dernier envoi d'un jour sans son dernier lot.

export type SyncRow = { day: string; kind: string; created: string; complete: boolean };

export type SyncSummary = {
  /** Jours de la période sans synchro complète (14 jours au plus examinés). */
  missing: string[];
  /** Plus ancienne des dernières synchros complètes des jours couverts (ISO), ou null. */
  freshness: string | null;
  partialAt: string | null;
};

export function daysBetweenInclusive(from: string, to: string, max = 14): string[] {
  const out: string[] = [];
  const start = Date.parse(`${from}T12:00:00Z`);
  const end = Date.parse(`${to}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return out;
  for (let t = start; t <= end && out.length < max; t += 86_400_000)
    out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** `rows` triées du plus récent au plus ancien. Groupes : fiches « groups » du jour, sinon celles des missions. */
export function syncSummary(
  rows: SyncRow[],
  from: string,
  to: string,
  kind: "missions" | "groups",
): SyncSummary {
  const byDay = new Map<string, SyncRow[]>();
  for (const r of rows) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r]);
  const missing: string[] = [];
  let freshness: string | null = null;
  let partialAt: string | null = null;
  for (const day of daysBetweenInclusive(from, to)) {
    const list = byDay.get(day) ?? [];
    const own =
      kind === "groups" && list.some((r) => r.kind === "groups")
        ? list.filter((r) => r.kind === "groups")
        : list.filter((r) => r.kind === "missions");
    const lastComplete = own.find((r) => r.complete);
    if (!lastComplete) missing.push(day);
    else if (!freshness || lastComplete.created < freshness) freshness = lastComplete.created;
    const latest = own[0];
    if (latest && !latest.complete && (!partialAt || latest.created > partialAt))
      partialAt = latest.created;
  }
  return { missing, freshness, partialAt };
}

// --- « Absente de DICOS » (11 oct. 2026) ---
// Chaque lot DICOS marque les missions qu'il contient (`last_seen_sync`, `last_seen_by` = propriétaire du jeton, hook
// PocketBase) ; le dernier lot d'une synchro porte `session_start`. Une mission encore « prévue » est absente de DICOS
// si la dernière synchro complète de SON jour faite par le MÊME agent a commencé après la dernière fois qu'elle a été vue.
// Pourquoi le même agent : la vue DICOS d'un agent peut être filtrée par gares et CSM ne connaît pas ce périmètre (les
// identifiants de gares DICOS restent dans l'extension) ; seule la synchro de celui qui l'a vue prouve sa disparition.
// Jamais signalée : mission vue par le secret partagé (pas d'agent), jamais vue depuis la mise en service, ou statut autre
// que « prévue ».

export type CompleteSync = { day: string; syncedBy: string; sessionStart: string };

const instant = (v: string) => Date.parse(v.includes("T") ? v : v.replace(" ", "T"));

/** Début de la dernière synchro complète par « jour|agent ». `rows` triées de la plus récente à la plus ancienne. */
export function latestSessions(rows: CompleteSync[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) {
    if (!r.syncedBy || !r.sessionStart) continue;
    const key = `${r.day}|${r.syncedBy}`;
    if (!out.has(key)) out.set(key, r.sessionStart);
  }
  return out;
}

export function isAbsentFromDicos(
  m: { status: string; day: string; lastSeenSync?: string; lastSeenBy?: string },
  sessions: Map<string, string>,
): boolean {
  if (m.status !== "prevue" || !m.lastSeenSync || !m.lastSeenBy) return false;
  const start = sessions.get(`${m.day}|${m.lastSeenBy}`);
  if (!start) return false;
  const a = instant(start);
  const b = instant(m.lastSeenSync);
  return Number.isFinite(a) && Number.isFinite(b) && a > b;
}
