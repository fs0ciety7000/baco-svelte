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
