// Construction du référentiel depuis le GTFS de la SNCB (lu en flux, fichier par fichier) + chemins Infrabel.
// Semaine de référence : 7 jours consécutifs ; un train = n° + suite d'arrêts, avec les jours où il circule.
// Ordre de lecture imposé : routes, calendar, calendar_dates, trips, stops, translations, stop_times.

import { foldStation } from "@/lib/stations/search";

import type { TrainPath } from "./infrabel";
import {
  DAY_BITS,
  hhmm,
  keyOf,
  lineKeyOf,
  relationKey,
  relationName,
  relationOrder,
  seriesOf,
  trainType,
  type ServiceStop,
  type TrainRelation,
  type TrainService,
} from "./model";

/** Types GTFS écartés : bus de remplacement. */
const SKIP_TYPES = new Set(["BUS"]);

type Trip = { number: number; short: string; mask: number };
type StopTime = { seq: number; stop: string; a: string; d: string; pass: boolean };

/** Service prêt à écrire dans PocketBase (clés de recherche comprises). */
export type ServiceRecord = TrainService & {
  stationsKey: string;
  passKey: string;
  linesKey: string;
};
export type RelationRecord = TrainRelation & { stationsKey: string; linesKey: string };

/** Jour de la semaine (lundi = 0) d'une date AAAAMMJJ. */
function dow(date: string): number {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8)));
  return (d.getUTCDay() + 6) % 7;
}

/** Empreinte courte (FNV-1a 32 bits) d'une suite d'arrêts. */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function timetableBuilder(dates: string[]) {
  const dayBit = dates.map((d) => DAY_BITS[dow(d)]!);
  const dateIndex = new Map(dates.map((d, i) => [d, i]));
  const routes = new Map<string, string>();
  const services = new Map<string, number>(); // service_id → masque sur les jours de la fenêtre
  const trips = new Map<string, Trip>();
  const stopNames = new Map<string, string>();
  const nl = new Map<string, string>(); // nom FR → nom NL
  const times = new Map<string, StopTime[]>();

  return {
    addRoute(r: Record<string, string>) {
      routes.set(r.route_id ?? "", String(r.route_short_name ?? "").trim());
    },
    addCalendar(r: Record<string, string>) {
      const cols = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      let mask = 0;
      dates.forEach((d, i) => {
        if (d < (r.start_date ?? "") || d > (r.end_date ?? "")) return;
        if (r[cols[dow(d)]!] === "1") mask |= 1 << i;
      });
      services.set(r.service_id ?? "", mask);
    },
    addCalendarDate(r: Record<string, string>) {
      const i = dateIndex.get(r.date ?? "");
      if (i === undefined) return;
      const id = r.service_id ?? "";
      const cur = services.get(id) ?? 0;
      services.set(id, r.exception_type === "1" ? cur | (1 << i) : cur & ~(1 << i));
    },
    addTrip(r: Record<string, string>) {
      const mask = services.get(r.service_id ?? "") ?? 0;
      if (!mask) return;
      const short = routes.get(r.route_id ?? "") ?? "";
      if (SKIP_TYPES.has(short.toUpperCase())) return;
      const number = Number(r.trip_short_name);
      if (!Number.isInteger(number) || number <= 0) return;
      trips.set(r.trip_id ?? "", { number, short, mask });
    },
    addStop(r: Record<string, string>) {
      stopNames.set(r.stop_id ?? "", String(r.stop_name ?? "").trim());
    },
    addTranslation(r: Record<string, string>) {
      if (
        r.table_name === "stops" &&
        r.field_name === "stop_name" &&
        r.language === "nl" &&
        r.field_value
      ) {
        if (r.translation && r.translation !== r.field_value) nl.set(r.field_value, r.translation);
      }
    },
    /** Vrai si le trajet fait partie de la fenêtre (évite de garder les horaires des autres jours). */
    wantsTrip(tripId: string) {
      return trips.has(tripId);
    },
    addStopTime(r: Record<string, string>) {
      const id = r.trip_id ?? "";
      if (!trips.has(id)) return;
      let list = times.get(id);
      if (!list) times.set(id, (list = []));
      list.push({
        seq: Number(r.stop_sequence) || 0,
        stop: r.stop_id ?? "",
        a: hhmm(r.arrival_time ?? ""),
        d: hhmm(r.departure_time ?? ""),
        pass: r.pickup_type === "1" && r.drop_off_type === "1",
      });
    },
    get tripCount() {
      return trips.size;
    },
    build(paths: TrainPath[]) {
      return buildReferential({ trips, times, stopNames, nl, dayBit }, paths);
    },
  };
}

function buildReferential(
  src: {
    trips: Map<string, Trip>;
    times: Map<string, StopTime[]>;
    stopNames: Map<string, string>;
    nl: Map<string, string>;
    dayBit: number[];
  },
  paths: TrainPath[],
): { services: ServiceRecord[]; relations: RelationRecord[] } {
  const byNumber = new Map(paths.map((p) => [p.number, p]));
  // Demi-bloc → relation majoritaire (repli pour un train absent des données Infrabel accumulées).
  const blocks = new Map<number, Map<string, number>>();
  // Gare → lignes (et nombre d'observations), pour déduire les lignes d'un train sans chemin Infrabel.
  const stationLines = new Map<string, Map<string, number>>();
  // Noms de gares connus d'Infrabel (FR et NL).
  const known = new Set<string>();
  for (const p of paths) {
    for (const pt of p.points) {
      known.add(foldStation(pt.n));
      if (pt.k) known.add(foldStation(pt.k));
    }
    if (p.relation) {
      const b = Math.floor(p.number / 50);
      const m = blocks.get(b) ?? new Map<string, number>();
      m.set(p.relation, (m.get(p.relation) ?? 0) + 1);
      blocks.set(b, m);
    }
    for (const pt of p.points) {
      if (!pt.l) continue;
      const k = foldStation(pt.n);
      const m = stationLines.get(k) ?? new Map<string, number>();
      m.set(pt.l, (m.get(pt.l) ?? 0) + 1);
      stationLines.set(k, m);
    }
  }
  const blockRelation = (n: number): string => {
    const m = blocks.get(Math.floor(n / 50));
    if (!m) return "";
    let best = "";
    let bestN = 0;
    let total = 0;
    for (const [r, c] of m) {
      total += c;
      if (c > bestN) [best, bestN] = [r, c];
    }
    return bestN / total >= 0.8 ? best : "";
  };

  // 1. Trajets → services (n° + suite d'arrêts), jours fusionnés.
  const grouped = new Map<string, { svc: TrainService; short: string }>();
  for (const [id, trip] of src.trips) {
    const list = src.times.get(id);
    if (!list || list.length < 2) continue;
    list.sort((a, b) => a.seq - b.seq);
    const stops: ServiceStop[] = list.map((s) => {
      const n = src.stopNames.get(s.stop) || s.stop;
      const st: ServiceStop = { n };
      const t = src.nl.get(n);
      if (t) st.t = t;
      if (s.a) st.a = s.a;
      if (s.d) st.d = s.d;
      if (s.pass) st.p = 1;
      return st;
    });
    // Origine et terminus : jamais des passages sans arrêt.
    const sig = stops.map((s) => `${s.n}/${s.a ?? ""}/${s.d ?? ""}/${s.p ? 1 : 0}`).join(";");
    const key = `${trip.number}:${fnv(sig)}`;
    let days = 0;
    src.dayBit.forEach((bit, i) => {
      if (trip.mask & (1 << i)) days |= bit;
    });
    const g = grouped.get(key);
    if (g) {
      g.svc.days |= days;
      continue;
    }
    const halts = stops.filter((s) => !s.p);
    grouped.set(key, {
      short: trip.short,
      svc: {
        key,
        number: trip.number,
        type: "",
        relation: "",
        relationSource: "gtfs",
        series: seriesOf(trip.number),
        origin: halts[0]?.n ?? stops[0]!.n,
        terminus: halts[halts.length - 1]?.n ?? stops[stops.length - 1]!.n,
        days,
        stops,
        lines: [],
        linesSource: "",
        firstDep: halts[0]?.d ?? halts[0]?.a ?? "",
        lastArr: halts[halts.length - 1]?.a ?? halts[halts.length - 1]?.d ?? "",
      },
    });
  }

  // 2. Relation, type et lignes de chaque service.
  const services: ServiceRecord[] = [];
  for (const { svc, short } of grouped.values()) {
    const path = trustedPath(byNumber.get(svc.number), svc.stops, known);
    if (path?.relation) {
      svc.relation = path.relation;
      svc.relationSource = "infrabel";
    } else {
      const fromBlock = blockRelation(svc.number);
      if (fromBlock && trainType(fromBlock) === trainType("", short)) {
        svc.relation = fromBlock;
        svc.relationSource = "serie";
      } else {
        svc.relation = relationName(short) || "?";
        svc.relationSource = "gtfs";
      }
    }
    svc.type = trainType(svc.relation, short);

    if (path && path.points.length) {
      // Ligne à chaque arrêt : point Infrabel de même nom (FR ou NL), parcouru dans l'ordre (un train peut repasser
      // par une gare). Lignes du train : tranche du chemin entre le premier et le dernier arrêt retrouvés.
      let from = 0;
      let first = -1;
      let last = -1;
      const matched: number[] = [];
      for (const st of svc.stops) {
        matched.push(-1);
        for (let i = from; i < path.points.length; i++) {
          if (samePoint(st, path.points[i]!)) {
            if (path.points[i]!.l) st.l = path.points[i]!.l;
            if (first < 0) first = i;
            last = i;
            from = i + 1;
            matched[matched.length - 1] = i;
            break;
          }
        }
      }
      // Gares traversées sans arrêt (le GTFS n'en marque presque aucune) : points Infrabel entre deux arrêts retrouvés,
      // ajoutés en passage (`p: 1`, sans heure).
      const merged: ServiceStop[] = [];
      let prev = -1;
      svc.stops.forEach((st, si) => {
        const mi = matched[si]!;
        if (mi >= 0 && prev >= 0) {
          for (let j = prev + 1; j < mi; j++) {
            const pt = path.points[j]!;
            if (svc.stops.some((x) => samePoint(x, pt))) continue;
            const pass: ServiceStop = { n: pt.n, p: 1 };
            if (pt.k) pass.t = pt.k;
            if (pt.l) pass.l = pt.l;
            merged.push(pass);
          }
        }
        merged.push(st);
        if (mi >= 0) prev = mi;
      });
      svc.stops = merged;
      const a = path.points[first]?.i;
      const b = path.points[last]?.i;
      svc.lines =
        a !== undefined && b !== undefined && b >= a ? path.lines.slice(a, b + 1) : path.lines;
      svc.linesSource = "infrabel";
    } else {
      // Sans chemin : ligne commune à deux gares voisines (la plus observée).
      const seq: string[] = [];
      for (let i = 0; i < svc.stops.length; i++) {
        const here = stationLines.get(foldStation(svc.stops[i]!.n));
        const next = stationLines.get(
          foldStation(svc.stops[i + 1]?.n ?? svc.stops[i - 1]?.n ?? ""),
        );
        if (!here || !next) continue;
        let best = "";
        let bestN = 0;
        for (const [l, c] of here) {
          const n = next.get(l);
          if (n && c + n > bestN) [best, bestN] = [l, c + n];
        }
        if (best) {
          svc.stops[i]!.l = best;
          if (seq[seq.length - 1] !== best) seq.push(best);
        }
      }
      svc.lines = seq;
      svc.linesSource = seq.length ? "deduite" : "";
    }

    const names = (pass: boolean) =>
      svc.stops.filter((s) => !!s.p === pass).flatMap((s) => [s.n, s.t ?? ""]);
    services.push({
      ...svc,
      stationsKey: keyOf(names(false)),
      passKey: keyOf(names(true)),
      linesKey: lineKeyOf([...svc.lines, ...svc.stops.map((s) => s.l ?? "")]),
    });
  }

  return { services, relations: buildRelations(services) };
}

/**
 * Chemin Infrabel retenu seulement s'il décrit bien ce train : au moins 60 % de ses gares d'arrêt s'y retrouvent. Les
 * numéros des trains supplémentaires (« EXTRA ») sont réutilisés pour des trajets différents d'un jour à l'autre.
 */
function trustedPath(
  path: TrainPath | undefined,
  stops: ServiceStop[],
  known: Set<string>,
): TrainPath | undefined {
  if (!path) return undefined;
  // Gares étrangères ou inconnues d'Infrabel (Luxembourg, Aachen…) : hors du calcul.
  const halts = stops.filter(
    (s) => !s.p && (known.has(foldStation(s.n)) || (!!s.t && known.has(foldStation(s.t)))),
  );
  if (!halts.length || !path.points.length)
    return path.relation ? { ...path, points: [], lines: [] } : undefined;
  const found = halts.filter((s) => path.points.some((p) => samePoint(s, p))).length;
  return found / halts.length >= 0.6 ? path : undefined;
}

/** Arrêt GTFS et point Infrabel de même nom (FR ou NL des deux côtés). */
function samePoint(st: ServiceStop, p: TrainPath["points"][number]): boolean {
  const a = [foldStation(st.n), st.t ? foldStation(st.t) : ""];
  const b = [foldStation(p.n), p.k ? foldStation(p.k) : ""];
  return a.some((x) => x && b.includes(x));
}

function buildRelations(services: ServiceRecord[]): RelationRecord[] {
  const groups = new Map<string, ServiceRecord[]>();
  for (const s of services) {
    const k = relationKey(s);
    const g = groups.get(k);
    if (g) g.push(s);
    else groups.set(k, [s]);
  }
  const out: RelationRecord[] = [];
  for (const [key, list] of groups) {
    const variants = new Map<
      string,
      { from: string; to: string; numbers: Set<number>; days: number }
    >();
    const pairs = new Map<string, number>();
    for (const s of list) {
      const vk = `${s.origin}→${s.terminus}`;
      const v = variants.get(vk) ?? { from: s.origin, to: s.terminus, numbers: new Set(), days: 0 };
      v.numbers.add(s.number);
      v.days |= s.days;
      variants.set(vk, v);
      const pk = [s.origin, s.terminus].sort().join("~");
      pairs.set(pk, (pairs.get(pk) ?? 0) + 1);
    }
    const sortedVariants = [...variants.values()].sort((a, b) => b.numbers.size - a.numbers.size);
    const top = sortedVariants[0]!;
    // Variante de référence : la plus fréquente, et parmi ses trains celui qui a le plus d'arrêts.
    const ref = list
      .filter((s) => s.origin === top.from && s.terminus === top.to)
      .sort((a, b) => b.stops.filter((x) => !x.p).length - a.stops.filter((x) => !x.p).length)[0]!;
    const numbers = [...new Set(list.map((s) => s.number))].sort((a, b) => a - b);
    out.push({
      key,
      relation: list[0]!.relation,
      type: list[0]!.type,
      label: `${top.from} – ${top.to}`,
      variants: sortedVariants.map((v) => ({
        from: v.from,
        to: v.to,
        trains: v.numbers.size,
        days: v.days,
      })),
      series: [...new Set(numbers.map(seriesOf))].sort((a, b) => parseInt(a) - parseInt(b)),
      lines: ref.lines,
      numbers: numbers.slice(0, 500),
      pattern: ref.stops.slice(0, 300),
      trains: numbers.length,
      days: list.reduce((d, s) => d | s.days, 0),
      stationsKey: mergeKeys(list.map((s) => s.stationsKey)),
      linesKey: mergeKeys(list.map((s) => s.linesKey)),
    });
  }
  return out.sort(relationOrder);
}

function mergeKeys(keys: string[]): string {
  const set = new Set<string>();
  for (const k of keys) for (const p of k.split("|")) if (p) set.add(p);
  return set.size ? `|${[...set].join("|")}|` : "";
}
