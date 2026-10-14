// Référentiel des gares (14 oct. 2026) : une fiche par gare desservie (GTFS SNCB), complétée par Infrabel (abréviation,
// noms FR / NL) ; pays et alias pour les gares frontière (« Maubeuge (FR) » se cherche « Maubeuge », « Aachen Hbf (DE) »
// « Aachen »). District proposé d'après le référentiel BACO (`districtForStation`) ; modifiable ensuite dans CSM.

import { districtForStation } from "@/lib/pmr/districts";
import { foldStation } from "@/lib/stations/search";

import type { OpPoint } from "./infrabel";
import { keyOf } from "./model";

export type StationSeed = {
  name: string;
  nl?: string;
  uic?: string;
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

export function buildStations(seeds: StationSeed[], ops: Map<string, OpPoint>): StationRecord[] {
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
      lines: [...new Set(s.lines)].sort((a, b) => a.localeCompare(b, "fr", { numeric: true })),
      searchKey: keyOf([s.name, ...aliases, op?.abbr ?? ""]),
      served: s.served,
    });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
