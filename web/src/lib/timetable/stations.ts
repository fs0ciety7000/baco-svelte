// Référentiel des gares (14 oct. 2026) : une fiche par gare desservie (GTFS SNCB), complétée par Infrabel (abréviation,
// noms FR / NL) ; pays et alias pour les gares frontière (« Maubeuge (FR) » se cherche « Maubeuge », « Aachen Hbf (DE) »
// « Aachen »). District proposé d'après le référentiel BACO (`districtForStation`) ; modifiable ensuite dans CSM.

import { districtForStation } from "@/lib/pmr/districts";
import { foldStation } from "@/lib/stations/search";

import type { OpPoint, TrainPath } from "./infrabel";
import { keyOf } from "./model";

export type StationSeed = {
  name: string;
  nl?: string;
  uic?: string;
  lat?: number;
  lon?: number;
  lines: string[];
  served: boolean;
};

export type StationRecord = {
  key: string;
  name: string;
  nameNl: string;
  abbr: string;
  uic: string;
  country: string;
  district: string;
  aliases: string[];
  lines: string[];
  searchKey: string;
  served: boolean;
  /** gare (Station), pang (point d'arrêt non gardé), etranger. */
  kind: "gare" | "pang" | "etranger" | "";
  lat?: number;
  lon?: number;
};

/** Districts d'une gare (5 districts SNCB ; l'équipe filtre sur DSO, DSE, DCE). */
export const STATION_DISTRICTS = ["DSO", "DSE", "DCE", "DNO", "DNE"] as const;
export const STATION_DISTRICT_LABEL: Record<string, string> = {
  DSO: "Sud-Ouest",
  DSE: "Sud-Est",
  DCE: "Centre",
  DNO: "Nord-Ouest",
  DNE: "Nord-Est",
};

/** Pays d'une gare d'après le suffixe GTFS (« Luxembourg (LU) ») ; Belgique sinon. */
export function countryOf(name: string): string {
  return /\(([A-Z]{2})\)\s*$/.exec(name)?.[1] ?? "BE";
}

/** Nom sans suffixe de pays. */
export const bareName = (name: string) => name.replace(/\s*\([A-Z]{2}\)\s*$/, "").trim();

/** Alias d'une gare : nom sans pays, nom NL, noms Infrabel, et pour l'étranger le premier mot (« Aachen », « Lille »). */
export function aliasesOf(name: string, extra: (string | undefined)[]): string[] {
  const out = new Set<string>();
  const bare = bareName(name);
  if (bare !== name) out.add(bare);
  if (countryOf(name) !== "BE") {
    const first = bare.split(/[\s-]+/)[0] ?? "";
    if (first.length >= 4) out.add(first);
  }
  for (const e of extra) if (e && e.trim()) out.add(e.trim());
  out.delete(name);
  return [...out];
}

/**
 * Fiches des gares : celles des trains de la semaine (GTFS), puis toutes les gares et PANG d'Infrabel qui n'y figurent
 * pas (sans train cette semaine-là), avec les lignes relevées sur les chemins Infrabel.
 */
export function buildStations(
  gtfsSeeds: StationSeed[],
  ops: Map<string, OpPoint>,
  paths: TrainPath[] = [],
): StationRecord[] {
  const pathLines = new Map<string, Set<string>>();
  for (const p of paths)
    for (const pt of p.points) {
      if (!pt.l) continue;
      for (const n of [pt.n, pt.k]) {
        if (!n) continue;
        const k = foldStation(n);
        const set = pathLines.get(k) ?? new Set<string>();
        set.add(pt.l);
        pathLines.set(k, set);
      }
    }
  const seen = new Set(
    gtfsSeeds.flatMap((s) => [foldStation(s.name), s.nl ? foldStation(s.nl) : ""]),
  );
  const seeds = [...gtfsSeeds];
  for (const op of ops.values()) {
    if (!op.station || !op.fr) continue;
    if (seen.has(foldStation(op.fr)) || (op.nl && seen.has(foldStation(op.nl)))) continue;
    seen.add(foldStation(op.fr));
    seeds.push({
      name: op.fr,
      nl: op.nl && op.nl !== op.fr ? op.nl : undefined,
      lat: op.lat,
      lon: op.lon,
      lines: [...(pathLines.get(foldStation(op.fr)) ?? [])],
      served: false,
    });
  }
  // Points Infrabel indexés par nom FR / NL replié.
  const byName = new Map<string, OpPoint>();
  for (const op of ops.values()) {
    if (!op.station) continue;
    for (const n of [op.fr, op.nl]) if (n) byName.set(foldStation(n), op);
  }
  const out = new Map<string, StationRecord>();
  for (const s of seeds) {
    const key = foldStation(s.name);
    if (!key) continue;
    const prev = out.get(key);
    if (prev) {
      prev.lines = [...new Set([...prev.lines, ...s.lines])];
      prev.served ||= s.served;
      continue;
    }
    const op =
      byName.get(key) ??
      byName.get(foldStation(bareName(s.name))) ??
      (s.nl ? byName.get(foldStation(s.nl)) : undefined);
    const aliases = aliasesOf(s.name, [s.nl, op?.fr, op?.nl]);
    const district =
      districtForStation(s.name) || aliases.map((a) => districtForStation(a)).find(Boolean) || "";
    out.set(key, {
      key,
      name: s.name,
      nameNl: s.nl ?? (op?.nl && op.nl !== s.name ? op.nl : ""),
      abbr: op?.abbr ?? "",
      uic: s.uic ?? "",
      country: countryOf(s.name),
      district,
      aliases,
      lines: [...new Set([...s.lines, ...(pathLines.get(key) ?? [])])].sort((a, b) =>
        a.localeCompare(b, "fr", { numeric: true }),
      ),
      searchKey: keyOf([s.name, ...aliases, op?.abbr ?? ""]),
      served: s.served,
      kind: countryOf(s.name) !== "BE" ? "etranger" : (op?.kind ?? ""),
      lat: s.lat ?? op?.lat,
      lon: s.lon ?? op?.lon,
    });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
