import "server-only";

import type { RecordModel } from "pocketbase";

import { foldStation } from "@/lib/stations/search";
import {
  DAY_FILTERS,
  relationKey,
  relationOrder,
  stopMatches,
  type DayFilter,
  type ServiceStop,
  type TrainRelation,
} from "@/lib/timetable/model";
import type { TimetableStatus } from "@/server/timetable/import";

import { resolveStationTerms } from "../stations";
import { pbForRequest } from "./orders";

// Référentiel des relations de trains (Ressources › Trains), lu avec le jeton de l'agent : `train_relations` et
// `train_services` (règles : agents connectés hors invité et compte Écran), état de l'import dans `app_settings`.

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : 0);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export type RelationRow = Omit<TrainRelation, "pattern" | "numbers"> & { id: string };
export type ServiceRow = {
  id: string;
  key: string;
  number: number;
  type: string;
  relation: string;
  relationSource: string;
  series: string;
  origin: string;
  terminus: string;
  days: number;
  stops: ServiceStop[];
  lines: string[];
  linesSource: string;
  firstDep: string;
  lastArr: string;
};

const REL_FIELDS = "id,key,relation,type,label,variants,series,lines,trains,days";

function relationRow(r: RecordModel): RelationRow {
  return {
    id: r.id,
    key: str(r.key),
    relation: str(r.relation),
    type: str(r.type),
    label: str(r.label),
    variants: arr(r.variants),
    series: arr(r.series),
    lines: arr(r.lines),
    trains: num(r.trains),
    days: num(r.days),
  };
}

function serviceRow(r: RecordModel): ServiceRow {
  return {
    id: r.id,
    key: str(r.key),
    number: num(r.number),
    type: str(r.type),
    relation: str(r.relation),
    relationSource: str(r.relation_source),
    series: str(r.series),
    origin: str(r.origin),
    terminus: str(r.terminus),
    days: num(r.days),
    stops: arr(r.stops),
    lines: arr(r.lines),
    linesSource: str(r.lines_source),
    firstDep: str(r.first_dep),
    lastArr: str(r.last_arr),
  };
}

/** État du dernier import (null si jamais lancé). */
export async function timetableState(): Promise<TimetableStatus | null> {
  const pb = await pbForRequest();
  try {
    const r = await pb
      .collection("app_settings")
      .getFirstListItem(pb.filter("key = {:k}", { k: "timetable" }), { fields: "value" });
    const v = r.value as TimetableStatus | null;
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/** « 96 », « L.96 », « l 96 » → « 96 ». */
export function normLine(raw: string | undefined): string {
  return String(raw ?? "")
    .trim()
    .replace(/^L\.?\s*/i, "")
    .toUpperCase()
    .slice(0, 12);
}

/** Noms de gare repliés pour une saisie (accents, abréviation PtCar, nom FR / NL). */
async function stationKeys(gare: string): Promise<Set<string>> {
  const terms = await resolveStationTerms(gare, 6);
  const set = new Set([gare, ...terms].map(foldStation).filter(Boolean));
  return set;
}

/** Filtre « clé contient l'un des noms » (OU lié) sur un champ `|nom|…|`. */
function keyFilter(
  pb: Awaited<ReturnType<typeof pbForRequest>>,
  fields: string[],
  keys: Iterable<string>,
) {
  const params: Record<string, string> = {};
  const ors: string[] = [];
  let i = 0;
  for (const k of keys) {
    params[`k${i}`] = `|${k}|`;
    for (const f of fields) ors.push(`${f} ~ {:k${i}}`);
    i++;
  }
  return ors.length ? pb.filter(`(${ors.join(" || ")})`, params) : "";
}

export type RelationFilters = { type?: string; line?: string; gare?: string; q?: string };

/** Relations filtrées, et toutes les lignes connues (liste de choix). */
export async function listTrainRelations(
  f: RelationFilters,
): Promise<{ rows: RelationRow[]; lines: string[] }> {
  const pb = await pbForRequest();
  const parts: string[] = [];
  const type = (f.type ?? "").toUpperCase();
  if (["IC", "L", "S", "P"].includes(type)) parts.push(pb.filter("type = {:t}", { t: type }));
  else if (type === "AUTRES")
    parts.push('type != "IC" && type != "L" && type != "S" && type != "P"');
  const line = normLine(f.line);
  if (line) parts.push(pb.filter("lines_key ~ {:l}", { l: `|${line}|` }));
  if (f.gare) {
    const k = keyFilter(pb, ["stations_key"], await stationKeys(f.gare));
    if (k) parts.push(k);
  }
  const q = (f.q ?? "").trim().slice(0, 40);
  if (q) parts.push(pb.filter("(relation ~ {:q} || label ~ {:q})", { q }));
  const [items, all] = await Promise.all([
    pb.collection("train_relations").getFullList({
      filter: parts.join(" && "),
      fields: REL_FIELDS,
      batch: 1000,
    }),
    pb.collection("train_relations").getFullList({ fields: "lines_key", batch: 1000 }),
  ]);
  const lines = new Set<string>();
  for (const r of all) for (const l of str(r.lines_key).split("|")) if (l) lines.add(l);
  return {
    rows: items.map(relationRow).sort(relationOrder),
    lines: [...lines].sort((a, b) => a.localeCompare(b, "fr", { numeric: true })),
  };
}

/** Une relation, ses trains (triés par heure de départ). */
export async function getTrainRelation(
  key: string,
): Promise<{ relation: TrainRelation & { id: string }; services: ServiceRow[] } | null> {
  const pb = await pbForRequest();
  const k = key.trim().slice(0, 300);
  if (!k) return null;
  let rec: RecordModel;
  try {
    rec = await pb.collection("train_relations").getFirstListItem(pb.filter("key = {:k}", { k }));
  } catch {
    return null;
  }
  const relation = {
    ...relationRow(rec),
    numbers: arr<number>(rec.numbers),
    pattern: arr<ServiceStop>(rec.pattern),
  };
  const services = (
    await pb.collection("train_services").getFullList({
      filter: pb.filter("relation = {:r}", { r: relation.relation }),
      sort: "first_dep,number",
      batch: 1000,
    })
  )
    .map(serviceRow)
    .filter((s) => relationKey(s) === relation.key);
  return { relation, services };
}

/** Variantes d'un n° de train (et la clé de sa relation). */
export async function getTrain(number: number): Promise<ServiceRow[]> {
  if (!Number.isInteger(number) || number <= 0 || number > 99999) return [];
  const pb = await pbForRequest();
  const items = await pb.collection("train_services").getFullList({
    filter: pb.filter("number = {:n}", { n: number }),
    sort: "-days",
  });
  return items.map(serviceRow);
}

export type BoardRow = {
  number: number;
  type: string;
  relation: string;
  relationKey: string;
  origin: string;
  terminus: string;
  days: number;
  time: string;
  arr: string;
  dep: string;
  line: string;
  station: string;
  approx: boolean;
};

/** Trains qui s'arrêtent à une gare ou y passent sans arrêt, pour un type de jour, triés par heure. */
export async function stationBoard(
  gare: string,
  day: DayFilter,
): Promise<{ station: string; stops: BoardRow[]; passes: BoardRow[] }> {
  const pb = await pbForRequest();
  const keys = await stationKeys(gare);
  const filter = keyFilter(pb, ["stations_key", "pass_key"], keys);
  if (!filter) return { station: "", stops: [], passes: [] };
  const mask = DAY_FILTERS[day].mask;
  const items = await pb.collection("train_services").getFullList({
    filter,
    fields: "number,type,relation,origin,terminus,days,stops",
    batch: 1000,
  });
  const stops: BoardRow[] = [];
  const passes: BoardRow[] = [];
  const names = new Map<string, number>();
  for (const r of items) {
    const s = serviceRow(r);
    if (!(s.days & mask)) continue;
    let lastTime = "";
    for (const st of s.stops) {
      const known = st.d || st.a || "";
      if (!stopMatches(st, keys)) {
        if (known) lastTime = known;
        continue;
      }
      names.set(st.n, (names.get(st.n) ?? 0) + 1);
      const row: BoardRow = {
        number: s.number,
        type: s.type,
        relation: s.relation,
        relationKey: relationKey(s),
        origin: s.origin,
        terminus: s.terminus,
        days: s.days,
        arr: st.a ?? "",
        dep: st.d ?? "",
        // Passage sans heure (déduit d'Infrabel) : heure du dernier arrêt avant lui, affichée « ≈ ».
        time: known || lastTime,
        approx: !known,
        line: st.l ?? "",
        station: st.n,
      };
      (st.p ? passes : stops).push(row);
      break;
    }
  }
  const byTime = (a: BoardRow, b: BoardRow) => a.time.localeCompare(b.time) || a.number - b.number;
  const station = [...names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  return { station, stops: stops.sort(byTime), passes: passes.sort(byTime) };
}

export type LineStation = { name: string; stops: number; passes: number; relations: string[] };

/** Relations d'une ligne et gares de la ligne (dans l'ordre du référentiel s'il la connaît). */
export async function lineBoard(
  rawLine: string,
  day: DayFilter,
): Promise<{ line: string; relations: RelationRow[]; stations: LineStation[] }> {
  const line = normLine(rawLine);
  if (!line) return { line: "", relations: [], stations: [] };
  const pb = await pbForRequest();
  const mask = DAY_FILTERS[day].mask;
  const [rels, svcs, ref] = await Promise.all([
    pb.collection("train_relations").getFullList({
      filter: pb.filter("lines_key ~ {:l}", { l: `|${line}|` }),
      fields: REL_FIELDS,
      batch: 1000,
    }),
    pb.collection("train_services").getFullList({
      filter: pb.filter("lines_key ~ {:l}", { l: `|${line}|` }),
      fields: "number,type,relation,origin,terminus,days,stops",
      batch: 1000,
    }),
    pb
      .collection("line_stations")
      .getFullList({
        filter: pb.filter("line = {:a} || line = {:b}", { a: line, b: `L.${line}` }),
        sort: "position",
        fields: "station",
        batch: 1000,
      })
      .catch(() => []),
  ]);
  const by = new Map<string, LineStation & { order: number }>();
  let longest: ServiceStop[] = [];
  for (const r of svcs) {
    const s = serviceRow(r);
    if (!(s.days & mask)) continue;
    const onLine = s.stops.filter((st) => st.l === line);
    if (onLine.length > longest.length) longest = onLine;
    for (const st of onLine) {
      const cur = by.get(st.n) ?? { name: st.n, stops: 0, passes: 0, relations: [], order: 1e9 };
      if (st.p) cur.passes++;
      else cur.stops++;
      if (!st.p && !cur.relations.includes(s.relation)) cur.relations.push(s.relation);
      by.set(st.n, cur);
    }
  }
  // Ordre : référentiel des lignes (gares du sud), sinon le train qui parcourt le plus de gares de la ligne.
  const refOrder = new Map(ref.map((r, i) => [foldStation(str(r.station)), i]));
  const longOrder = new Map(longest.map((st, i) => [foldStation(st.n), i]));
  for (const s of by.values()) {
    const k = foldStation(s.name);
    s.order = refOrder.get(k) ?? (refOrder.size ? 1e6 : 0) + (longOrder.get(k) ?? 5e5);
    s.relations.sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
  }
  return {
    line,
    relations: rels.map(relationRow).sort(relationOrder),
    stations: [...by.values()]
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "fr"))
      .map((s) => ({ name: s.name, stops: s.stops, passes: s.passes, relations: s.relations })),
  };
}
