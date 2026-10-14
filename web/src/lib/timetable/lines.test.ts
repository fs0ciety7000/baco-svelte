import { describe, expect, it } from "vitest";

import {
  buildRailLines,
  lineDistrict,
  sectionsFrom,
  stationIndex,
  type LineSection,
  type PathPoint,
} from "./lines";

// Chemin d'un train : toutes les gares sur la même ligne (`l`).
const run = (line: string, names: string[]): { points: PathPoint[] } => ({
  points: names.map((n) => ({ n, l: line })),
});
const times = (k: number, p: { points: PathPoint[] }) => Array.from({ length: k }, () => p);
const names = (line: ReturnType<typeof buildRailLines>[number] | undefined, b = 0) =>
  (line?.stations ?? []).filter((s) => (s.b ?? 0) === b).map((s) => s.n);

const sec = (line: string, from: string, to: string, mFrom: number, mTo: number): LineSection => ({
  line,
  from,
  to,
  mFrom,
  mTo,
});

describe("buildRailLines", () => {
  it("ordonne une ligne parcourue dans les deux sens, dans le sens des points kilométriques", () => {
    const stations = stationIndex(
      ["Bruxelles-Midi", "Forest", "Hal", "Tubize", "Mons"].map((name, i) => ({
        name,
        abbr: `A${i}`,
        served: true,
      })),
    );
    const lines = buildRailLines(
      [
        ...times(5, run("96", ["Mons", "Tubize", "Hal", "Forest", "Bruxelles-Midi"])),
        ...times(5, run("96", ["Bruxelles-Midi", "Forest", "Hal", "Tubize", "Mons"])),
        ...times(3, run("96", ["Hal", "Tubize"])),
      ],
      {
        station: stations,
        sections: [sec("96", "A0", "A2", 200, 13300), sec("96", "A2", "A4", 13300, 60300)],
      },
    );
    expect(lines).toHaveLength(1);
    const l = lines[0]!;
    expect(l.line).toBe("96");
    expect(names(l)).toEqual(["Bruxelles-Midi", "Forest", "Hal", "Tubize", "Mons"]);
    expect(l.name).toBe("Bruxelles-Midi – Mons");
    expect(l.oriented).toBe(true);
    expect(l.stations.find((s) => s.n === "Hal")).toMatchObject({ a: "A2", km: 13.3 });
    expect(l.stations.find((s) => s.n === "Forest")?.km).toBeUndefined();
  });

  it("retire un raccourci (gare manquante dans quelques chemins) ; ordre alphabétique sans km", () => {
    const lines = buildRailLines([
      ...times(10, run("124", ["Waterloo", "Nivelles", "Luttre", "Charleroi"])),
      ...times(2, run("124", ["Waterloo", "Luttre", "Charleroi"])),
    ]);
    const l = lines.find((x) => x.line === "124");
    expect(names(l)).toEqual(["Charleroi", "Luttre", "Nivelles", "Waterloo"]);
    expect(l?.oriented).toBe(false);
    expect(l?.branches).toEqual([]);
  });

  it("liste un embranchement après le tronc, depuis la gare de bifurcation", () => {
    const lines = buildRailLines([
      ...times(20, run("36", ["A", "B", "C", "D", "E"])),
      ...times(6, run("36", ["E", "D", "C", "B", "A"])),
      ...times(4, run("36", ["A", "B", "X", "Y"])),
    ]);
    const l = lines[0]!;
    expect(names(l)).toEqual(["A", "B", "C", "D", "E"]);
    expect(l.branches).toEqual([{ b: 1, from: "B", to: "Y" }]);
    expect(names(l, 1)).toEqual(["X", "Y"]);
  });

  it("ignore l'arête vers une gare déjà sur une autre ligne, sauf au terminus du train", () => {
    const transfer = {
      points: [
        { n: "Moensberg", l: "124" },
        { n: "Linkebeek", l: "124" },
        { n: "Saint-Job", l: "26" },
        { n: "Boondael", l: "26" },
      ],
    };
    const terminus = {
      points: [
        { n: "Nimy", l: "118" },
        { n: "Mons", l: "97" },
      ],
    };
    const lines = buildRailLines([
      ...times(5, transfer),
      ...times(5, run("124", ["Uccle", "Moensberg", "Linkebeek"])),
      ...times(5, terminus),
      ...times(5, run("118", ["Obourg", "Nimy"])),
    ]);
    expect(names(lines.find((x) => x.line === "124"))).not.toContain("Saint-Job");
    expect(names(lines.find((x) => x.line === "118"))).toContain("Mons");
    expect(names(lines.find((x) => x.line === "26"))).toEqual(["Boondael", "Saint-Job"]);
  });

  it("rattache au tronc un morceau qui le prolonge (trou kilométrique marqué)", () => {
    const st = stationIndex(
      ["Schaerbeek", "Etterbeek", "La Hulpe", "Ottignies", "Gembloux", "Namur"].map((name) => ({
        name,
        abbr: name.slice(0, 3).toUpperCase(),
        served: true,
      })),
    );
    const lines = buildRailLines(
      [
        ...times(30, run("161", ["Ottignies", "Gembloux", "Namur"])),
        ...times(10, run("161", ["Schaerbeek", "Etterbeek", "La Hulpe"])),
      ],
      {
        station: st,
        sections: [
          sec("161", "SCH", "ETT", 1200, 8000),
          sec("161", "ETT", "LA ", 8000, 18000),
          sec("161", "OTT", "GEM", 29700, 44400),
          sec("161", "GEM", "NAM", 44400, 61500),
        ],
      },
    );
    const l = lines[0]!;
    expect(names(l)).toEqual([
      "Schaerbeek",
      "Etterbeek",
      "La Hulpe",
      "Ottignies",
      "Gembloux",
      "Namur",
    ]);
    expect(l.stations.find((s) => s.n === "Ottignies")?.g).toBe(1);
    expect(l.stations.filter((s) => s.g)).toHaveLength(1);
    expect(l.branches).toEqual([]);
  });

  it("garde un morceau isolé sans km comme tronçon séparé", () => {
    const lines = buildRailLines([
      ...times(30, run("50", ["Alost", "Denderleeuw", "Liedekerke"])),
      ...times(5, run("50", ["Gand", "Melle"])),
    ]);
    const l = lines[0]!;
    expect(names(l)).toEqual(["Alost", "Denderleeuw", "Liedekerke"]);
    expect(l.branches).toEqual([{ b: 1, from: "", to: "Melle" }]);
  });

  it("ne rend que les gares voyageurs ; bifurcation sur un point technique ramenée à la gare voisine", () => {
    const served = (name: string) => ({ name, abbr: "", served: !name.endsWith("-Garage") });
    const lines = buildRailLines(
      [
        ...times(20, run("96", ["Tubize", "Hennuyères", "Hennuyères-Garage", "Braine-le-Comte"])),
        ...times(5, run("96", ["Hennuyères", "Hennuyères-Garage", "Ecaussinnes"])),
      ],
      {
        station: stationIndex(
          ["Tubize", "Hennuyères", "Hennuyères-Garage", "Braine-le-Comte", "Ecaussinnes"].map(
            served,
          ),
        ),
      },
    );
    const l = lines[0]!;
    expect(l.stations.map((s) => s.n)).not.toContain("Hennuyères-Garage");
    expect(names(l)).toEqual(["Braine-le-Comte", "Hennuyères", "Tubize"]);
    // Bifurcation sur le point technique, entre deux gares voyageurs : l'une ou l'autre (la première trouvée).
    expect(l.branches).toEqual([{ b: 1, from: "Braine-le-Comte", to: "Ecaussinnes" }]);
  });

  it("écarte une arête rare sur une ligne fréquentée (détournement)", () => {
    const lines = buildRailLines([
      ...times(40, run("96", ["Jurbise", "Masnuy", "Neufvilles"])),
      ...times(2, run("96", ["Masnuy", "Lens"])),
    ]);
    expect(lines[0]!.stations.map((s) => s.n)).not.toContain("Lens");
  });

  it("ignore une ligne de moins de deux gares", () => {
    expect(buildRailLines([{ points: [{ n: "Mons", l: "97" }] }])).toEqual([]);
  });
});

describe("sectionsFrom", () => {
  it("garde le tronc des lignes (« 96 », pas « 96/1 ») et normalise le n°", () => {
    expect(
      sectionsFrom([
        { label: "96", symnamefrom: "fms", symnameto: "LQV", mfrom: "60300", mto: "74800" },
        { label: "96/1", symnamefrom: "YFCS", symnameto: "YFSG", mfrom: "0", mto: "2100" },
        { label: "11(1)", symnamefrom: "A", symnameto: "B", mfrom: "1", mto: "2" },
        { label: "50A", symnamefrom: "A", symnameto: "", mfrom: "1", mto: "2" },
      ]),
    ).toEqual([
      { line: "96", from: "FMS", to: "LQV", mFrom: 60300, mTo: 74800 },
      { line: "11", from: "A", to: "B", mFrom: 1, mTo: 2 },
    ]);
  });
});

describe("lineDistrict", () => {
  it("district majoritaire, égalité départagée DSO › DSE › DCE, vide sans district", () => {
    const d: Record<string, string> = { A: "DSE", B: "DSE", C: "DSO", D: "DCE", E: "DSO" };
    const of = (n: string) => d[n] ?? "";
    expect(lineDistrict(["A", "B", "C", "X"], of)).toEqual({
      district: "DSE",
      counts: { DSE: 2, DSO: 1 },
    });
    expect(lineDistrict(["A", "C"], of).district).toBe("DSO");
    expect(lineDistrict(["X", "Y"], of)).toEqual({ district: "", counts: {} });
  });
});
