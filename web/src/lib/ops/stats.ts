// Statistiques du module Opérations : agrégats calculés côté serveur (fonctions pures, testées). Pas de classement
// nominatif des agents (décision du 8 octobre 2026, même logique que la gamification retirée).

export type StatOrder = {
  kind: "bus" | "taxi";
  day: string; // AAAA-MM-JJ (Europe/Brussels)
  status: string;
  district: string;
  company: string;
  c3Type: number;
  buses: number;
  route: string;
  lines: string[];
  reason: string;
  sentAt: number; // epoch ms, 0 si inconnu
  confirmedAt: number;
};

export type StatAssist = {
  day: string;
  station: string;
  type: string;
  status: string;
  pax: number;
};

export type Granularity = "jour" | "semaine" | "mois";

export function granularityFor(from: string, to: string): Granularity {
  const days = (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000 + 1;
  return days <= 31 ? "jour" : days <= 190 ? "semaine" : "mois";
}

/** Lundi de la semaine d'un jour AAAA-MM-JJ. */
export function mondayOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function bucketOf(day: string, g: Granularity): string {
  return g === "jour" ? day : g === "semaine" ? mondayOf(day) : day.slice(0, 7);
}

/** Tous les seaux de la période (barres vides comprises). */
export function buckets(from: string, to: string, g: Granularity): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d <= end) {
    const b = bucketOf(d.toISOString().slice(0, 10), g);
    if (out[out.length - 1] !== b) out.push(b);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

const countBy = <T>(items: T[], key: (t: T) => string) => {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it) || "—";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
};

/** Délai envoi → confirmation en minutes (bornes : 0 à 48 h, au-delà la donnée est considérée fausse). */
function confirmMinutes(o: StatOrder): number | null {
  if (!o.sentAt || !o.confirmedAt || o.confirmedAt < o.sentAt) return null;
  const m = (o.confirmedAt - o.sentAt) / 60000;
  return m <= 48 * 60 ? m : null;
}

export function aggregate(
  orders: StatOrder[],
  assists: StatAssist[] | null,
  from: string,
  to: string,
) {
  const live = orders.filter((o) => o.status !== "brouillon");
  const bus = live.filter((o) => o.kind === "bus");
  const taxi = live.filter((o) => o.kind === "taxi");
  const g = granularityFor(from, to);
  const series = buckets(from, to, g).map((b) => ({
    label: b,
    bus: bus.filter((o) => bucketOf(o.day, g) === b).length,
    taxi: taxi.filter((o) => bucketOf(o.day, g) === b).length,
  }));
  const delays = live.map(confirmMinutes).filter((x): x is number => x !== null);
  const companies = new Map<string, StatOrder[]>();
  for (const o of live)
    companies.set(o.company || "Société inconnue", [
      ...(companies.get(o.company || "Société inconnue") ?? []),
      o,
    ]);
  const suppliers = [...companies.entries()]
    .map(([name, list]) => ({
      name,
      orders: list.length,
      buses: list.reduce((n, o) => n + (o.kind === "bus" ? o.buses : 0), 0),
      cancelled: list.filter((o) => o.status === "annule").length,
      medianConfirm: median(list.map(confirmMinutes).filter((x): x is number => x !== null)),
    }))
    .sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name));
  const lineCounts = new Map<string, number>();
  for (const o of bus) for (const l of o.lines) lineCounts.set(l, (lineCounts.get(l) ?? 0) + 1);
  return {
    granularity: g,
    totals: {
      bus: bus.length,
      buses: bus.reduce((n, o) => n + o.buses, 0),
      taxi: taxi.length,
      cancelled: live.filter((o) => o.status === "annule").length,
      cancelRate: live.length ? live.filter((o) => o.status === "annule").length / live.length : 0,
      medianConfirm: median(delays),
      assists: assists ? assists.filter((a) => a.status !== "annulee").length : null,
    },
    series,
    byType: countBy(bus, (o) => (o.c3Type ? `C3 type ${o.c3Type}` : "Type inconnu")),
    byDistrict: countBy(live, (o) => o.district),
    byReason: countBy(live, (o) => o.reason).slice(0, 8),
    byLine: [...lineCounts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10),
    suppliers,
    routes: countBy(live, (o) => o.route).slice(0, 10),
    pmr: assists
      ? {
          byStation: countBy(
            assists.filter((a) => a.status !== "annulee"),
            (a) => a.station,
          ).slice(0, 10),
          byType: countBy(
            assists.filter((a) => a.status !== "annulee"),
            (a) => a.type,
          ),
        }
      : null,
  };
}
export type Stats = ReturnType<typeof aggregate>;

/** Motif normalisé (casse, espaces, ponctuation finale) pour regrouper les saisies libres. */
export function normalizeReason(reason: string): string {
  const s = reason
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;:!]+$/, "");
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().slice(0, 60);
}
