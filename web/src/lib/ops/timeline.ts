import type { Impact } from "@/lib/pmr/train-delay";

// Frise « Ma journée » (demande du 10 oct. 2026) : missions PMR, groupes, bus et taxis du jour sur une ligne de temps.
// Types partagés client / serveur et calcul pur du placement (minutes, pistes sans chevauchement, plage affichée).

export type TimelineKind = "pmr" | "groupe" | "bus" | "taxi";

export type TimelineItem = {
  id: string;
  kind: TimelineKind;
  /** Heure de début « HH:MM » (Bruxelles). */
  start: string;
  /** Heure de fin « HH:MM » (bus : dernier départ prévu) ; vide = événement ponctuel. */
  end: string;
  train: string;
  title: string;
  detail: string;
  io: "IN" | "OUT" | "";
  station: string;
  district: string;
  impact: Impact | null;
  href: string;
};

export type Timeline = {
  day: string;
  generatedAt: string;
  items: TimelineItem[];
  stations: string[];
};

/** Durée visuelle minimale d'un événement (minutes) : un point reste cliquable et lisible. */
export const POINT_MINUTES = 45;

export function toMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hm);
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v < 48 * 60 ? v : null;
}

export const fromMinutes = (v: number) =>
  `${String(Math.floor(v / 60) % 24).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;

/** Intervalle occupé à l'écran : retard compris (la queue du retard ne doit pas recouvrir l'élément suivant). */
export function span(it: TimelineItem): { a: number; b: number } | null {
  const a = toMinutes(it.start);
  if (a === null) return null;
  const end = toMinutes(it.end);
  const delay = it.impact && !it.impact.cancelled ? it.impact.delay : 0;
  return { a, b: Math.max(end !== null && end > a ? end : a, a + POINT_MINUTES) + delay };
}

/** Plage affichée (heures pleines) : 6 h – 22 h au moins, élargie aux éléments du jour. */
export function hourRange(items: TimelineItem[]): { from: number; to: number } {
  let from = 6 * 60;
  let to = 22 * 60;
  for (const it of items) {
    const s = span(it);
    if (!s) continue;
    from = Math.min(from, s.a);
    to = Math.max(to, s.b);
  }
  return { from: Math.floor(from / 60) * 60, to: Math.min(24 * 60, Math.ceil(to / 60) * 60) };
}

/** Répartit les éléments en pistes sans chevauchement (premier emplacement libre, éléments triés par début). */
export function packLanes(items: TimelineItem[]): { item: TimelineItem; lane: number }[] {
  const ends: number[] = [];
  const out: { item: TimelineItem; lane: number }[] = [];
  const sorted = items
    .map((item) => ({ item, s: span(item) }))
    .filter((x): x is { item: TimelineItem; s: { a: number; b: number } } => x.s !== null)
    .sort((x, y) => x.s.a - y.s.a || y.s.b - x.s.b);
  for (const { item, s } of sorted) {
    let lane = ends.findIndex((e) => e <= s.a);
    if (lane < 0) lane = ends.length;
    ends[lane] = s.b + 2;
    out.push({ item, lane });
  }
  return out;
}

export const TIMELINE_ROWS: { kind: TimelineKind; label: string }[] = [
  { kind: "pmr", label: "Missions PMR" },
  { kind: "groupe", label: "Groupes" },
  { kind: "bus", label: "Bus" },
  { kind: "taxi", label: "Taxis" },
];

/** Prochain élément (début ≥ maintenant, retard compris) — le mobile s'y place à l'ouverture. */
export function nextIndex(items: TimelineItem[], now: number): number {
  return items.findIndex((it) => {
    const a = toMinutes(it.start);
    const d = it.impact && !it.impact.cancelled ? it.impact.delay : 0;
    return a !== null && a + d >= now;
  });
}
