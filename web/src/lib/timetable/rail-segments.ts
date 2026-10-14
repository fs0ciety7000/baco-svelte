// Ligne du référentiel des trains (`rail_lines`) → ligne des bons bus (14 oct. 2026, fin de la table BACO line_stations) :
// gares dans l'ordre (tronc puis embranchements) et tronçons continus (tronc ; chaque embranchement depuis sa gare de
// bifurcation, ou seul pour un tronçon séparé) pour l'itinéraire de repli.

import type { LineInfo } from "@/lib/orders/stops";

export type RailStation = { n: string; a?: string; km?: number; b?: number; g?: number };
export type RailBranch = { b: number; from: string; to: string };

export const railStations = (v: unknown): RailStation[] =>
  Array.isArray(v)
    ? v.filter(
        (s): s is RailStation =>
          !!s && typeof s === "object" && typeof (s as RailStation).n === "string",
      )
    : [];

export const railBranches = (v: unknown): RailBranch[] =>
  Array.isArray(v)
    ? v.filter(
        (b): b is RailBranch =>
          !!b && typeof b === "object" && typeof (b as RailBranch).b === "number",
      )
    : [];

/** `line` : n° du référentiel (« 96 ») ; libellé des bons « L.96 » (comme BACO, compatible avec les bons existants). */
export function railLineInfo(
  line: string,
  stations: RailStation[],
  branches: RailBranch[],
): LineInfo {
  const trunk = stations.filter((s) => !s.b).map((s) => s.n);
  const segments: string[][] = trunk.length ? [trunk] : [];
  const nums = [...new Set(stations.filter((s) => s.b).map((s) => s.b!))].sort((a, b) => a - b);
  for (const b of nums) {
    const list = stations.filter((s) => s.b === b).map((s) => s.n);
    const from = branches.find((x) => x.b === b)?.from ?? "";
    segments.push(from && !list.includes(from) ? [from, ...list] : list);
  }
  return {
    line: `L.${line}`,
    stations: [...new Set(stations.map((s) => s.n))],
    segments: segments.filter((s) => s.length >= 2),
  };
}
