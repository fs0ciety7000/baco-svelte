// Bandeau « Incident en cours » de l'accueil Temps réel (identité du 4 nov. 2026, maquettes csm-brand v5). Logique pure :
// à partir des bons bus du jour encore « brouillon / en cours » et des urgences / perturbations récentes du Journal, décide
// s'il y a un incident à montrer et le résume. Aucune donnée nominative (ni voyageur, ni chauffeur).

export type IncidentOrder = {
  id: string;
  status: string;
  origin: string;
  destination: string;
  /** Heure d'appel « HH:MM » (peut être vide). */
  callTime: string;
  reason: string;
  passengers: number;
  buses: { cancelled?: boolean; demob?: string }[];
};

export type IncidentLog = {
  id: string;
  /** « HH:MM » (Bruxelles). */
  time: string;
  label: string;
  urgent: boolean;
  /** Message automatique iRail (perturbation, travaux). */
  irail: boolean;
};

export type IncidentRoute = { origin: string; destination: string; orders: number; buses: number };

export type Incident = {
  /** Heure de début (« HH:MM ») : premier appel de bus du jour ou première urgence, sinon vide. */
  since: string;
  title: string;
  /** Motif du premier bon, ou texte de l'urgence. */
  detail: string;
  /** Trajet principal (le plus de bus actifs), pour le schéma. Absent sans bon. */
  main: IncidentRoute | null;
  routes: IncidentRoute[];
  /** Bus non annulés et pas encore démobilisés, dans les bons en cours. */
  activeBuses: number;
  passengers: number;
  urgent: number;
  disturbances: number;
  /** Lien principal : le Suivi des bons du jour s'il y en a, sinon le Journal. */
  href: string;
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function routeKey(o: IncidentOrder): string {
  return `${clean(o.origin).toLowerCase()}→${clean(o.destination).toLowerCase()}`;
}

/** Bus encore sur la route : ni annulé, ni démobilisé. */
export function activeBusCount(o: IncidentOrder): number {
  return o.buses.filter((b) => !b.cancelled && !b.demob).length;
}

/**
 * Incident à montrer, ou `null` quand tout est calme. Un incident = au moins un bon bus du jour en cours, ou une urgence
 * du Journal dans la fenêtre lue par le serveur. Les perturbations iRail seules ne suffisent pas (il y en a tous les
 * jours sur le réseau) : elles ne sont que comptées.
 */
export function buildIncident(orders: IncidentOrder[], logs: IncidentLog[]): Incident | null {
  const running = orders.filter((o) => o.status === "brouillon" && (o.origin || o.destination));
  const urgent = logs.filter((l) => l.urgent);
  if (!running.length && !urgent.length) return null;

  const byRoute = new Map<string, IncidentRoute>();
  for (const o of running) {
    const k = routeKey(o);
    const r = byRoute.get(k) ?? {
      origin: clean(o.origin) || "?",
      destination: clean(o.destination) || "?",
      orders: 0,
      buses: 0,
    };
    r.orders += 1;
    r.buses += activeBusCount(o);
    byRoute.set(k, r);
  }
  const routes = [...byRoute.values()].sort(
    (a, b) => b.buses - a.buses || b.orders - a.orders || a.origin.localeCompare(b.origin),
  );
  const main = routes[0] ?? null;

  const times = [
    ...running.map((o) => o.callTime).filter(Boolean),
    ...urgent.map((l) => l.time).filter(Boolean),
  ].sort();
  const firstOrder = [...running].sort((a, b) =>
    (a.callTime || "99:99").localeCompare(b.callTime || "99:99"),
  )[0];

  let title: string;
  let detail: string;
  if (main) {
    const others = routes.length - 1;
    title = `Bus de remplacement ${main.origin} → ${main.destination}`;
    if (others > 0)
      title += ` et ${others} autre${others > 1 ? "s" : ""} trajet${others > 1 ? "s" : ""}`;
    detail = clean(firstOrder?.reason ?? "") || (urgent[0] ? clean(urgent[0].label) : "");
  } else {
    title = clean(urgent[0]!.label).slice(0, 120);
    detail = urgent.length > 1 ? `${urgent.length} urgences au Journal` : "Urgence au Journal";
  }

  return {
    since: times[0] ?? "",
    title,
    detail: detail.slice(0, 200),
    main,
    routes,
    activeBuses: running.reduce((n, o) => n + activeBusCount(o), 0),
    passengers: running.reduce((n, o) => n + (Number.isFinite(o.passengers) ? o.passengers : 0), 0),
    urgent: urgent.length,
    disturbances: logs.filter((l) => l.irail && !l.urgent).length,
    href: running.length ? "/commandes/suivi?vue=aujourdhui" : "/operations/journal?urgentes=1",
  };
}
