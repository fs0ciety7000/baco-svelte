// Bon bus « à confirmer d'urgence » (demande du 11 oct. 2026) : envoyé, pas confirmé, premier départ prévu dans 2 h au
// plus (ou passé depuis 1 h au plus). Miroir de `busUrgency` dans `pocketbase/pb_hooks/lib/alerts.js` (cron `bus-h2`,
// qui notifie les agents du district) : toute modification se fait des deux côtés. Pur, testé.

const HHMM = /^(\d{2}):(\d{2})$/;
export const URGENT_BEFORE_MIN = 120;
export const URGENT_AFTER_MIN = 60;

export type UrgencyOrder = {
  status: string;
  /** Jour de service « AAAA-MM-JJ » (`order_date` est stocké à minuit UTC). */
  day: string;
  callTime?: string;
  buses?: { planned?: string; cancelled?: boolean }[] | null;
};

const minutesOf = (hhmm: string) => {
  const m = HHMM.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
};

function dayDiff(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) : NaN;
}

/** Premier départ prévu : plus petite heure prévue des bus non annulés, sinon l'heure d'appel. */
export function firstDeparture(callTime: string | undefined, buses: UrgencyOrder["buses"]): string {
  const times = (buses ?? [])
    .filter((b) => b && !b.cancelled && HHMM.test(b.planned ?? ""))
    .map((b) => b.planned!)
    .sort();
  if (times.length) return times[0]!;
  return HHMM.test(callTime ?? "") ? callTime! : "";
}

/**
 * `{ time, minutes }` (minutes avant le départ, négatif = passé) si le bon est à confirmer d'urgence, sinon null.
 * `today` (« AAAA-MM-JJ ») et `nowMin` (minutes depuis minuit) en heure de Bruxelles.
 */
export function busUrgency(
  o: UrgencyOrder,
  today: string,
  nowMin: number,
): { time: string; minutes: number } | null {
  if (o.status !== "envoye" || !o.day) return null;
  const time = firstDeparture(o.callTime, o.buses);
  if (!time) return null;
  const diff = dayDiff(today, o.day);
  if (!Number.isFinite(diff)) return null;
  const minutes = diff * 1440 + minutesOf(time) - nowMin;
  if (minutes > URGENT_BEFORE_MIN || minutes < -URGENT_AFTER_MIN) return null;
  return { time, minutes };
}
