import { describe, expect, it } from "vitest";

import {
  bkFromPosts,
  crossingNumber,
  kmPostsFrom,
  estimateBk,
  matchCrossings,
  numberKey,
  parseInfrabelCrossing,
  prettyCommune,
  type InfrabelCrossing,
} from "./crossings";
import { fromLocal, haversineKm, toLocal } from "./geo";
import {
  assignStationZones,
  crossingZone,
  lineGraph,
  zonesOfDistricts,
  type ZoneStation,
} from "./spi";
import { boundedCells, clipHalfPlane, polygonArea, zoneGeoJson, zoneShapes } from "./voronoi";

const row = (o: Partial<Record<string, string>>) => ({
  fld_naam_ramses: "L-36-14",
  type_pn: "Signalisation active fermeture partielle",
  fld_geo_x: "5.210803756797797",
  fld_geo_y: "50.70513807514151",
  fld_postcode_en_gemeente: "4257 CORSWAREM (BERLOZ)",
  position_du_passage_a_niveau: "50.70513807514151, 5.210803756797797",
  ...o,
});

describe("PN Infrabel", () => {
  it("lit une ligne du fichier", () => {
    expect(parseInfrabelCrossing(row({}))).toEqual({
      infrabelId: "L-36-14",
      line: "L.36",
      number: "14",
      lat: 50.705138,
      lon: 5.210804,
      commune: "4257 Corswarem (Berloz)",
      signal: "Signalisation active fermeture partielle",
    });
  });
  it("suffixes, lignes à lettre et position de repli", () => {
    expect(parseInfrabelCrossing(row({ fld_naam_ramses: "L-75A-5BIS" }))?.number).toBe("5 bis");
    expect(parseInfrabelCrossing(row({ fld_naam_ramses: "L-134-3TER" }))?.number).toBe("3 ter");
    expect(parseInfrabelCrossing(row({ fld_naam_ramses: "L-90C-012A" }))).toMatchObject({
      line: "L.90C",
      number: "12A",
    });
    expect(parseInfrabelCrossing(row({ fld_geo_x: "", fld_geo_y: "" }))?.lat).toBeCloseTo(
      50.705138,
      5,
    );
  });
  it("ignore les zones portuaires et les positions hors Belgique", () => {
    expect(parseInfrabelCrossing(row({ fld_naam_ramses: "Antwerpen-DS-Alaska-269" }))).toBeNull();
    expect(
      parseInfrabelCrossing(row({ fld_geo_y: "0", position_du_passage_a_niveau: "" })),
    ).toBeNull();
  });
  it("numéros et communes", () => {
    expect(crossingNumber("007", "")).toBe("7");
    expect(numberKey("5 bis")).toBe(numberKey("5Bis"));
    expect(prettyCommune("7730 BAILLEUL (ESTAIMPUIS)")).toBe("7730 Bailleul (Estaimpuis)");
    expect(prettyCommune("6110 MONTIGNY-LE-TILLEUL")).toBe("6110 Montigny-Le-Tilleul");
  });
});

describe("rapprochement des PN", () => {
  const infra = (id: string, line: string, number: string, lat: number, lon: number) =>
    ({ infrabelId: id, line, number, lat, lon, commune: "", signal: "" }) as InfrabelCrossing;
  it("n° Infrabel, puis ligne + numéro, puis proximité sur la même ligne", () => {
    const known = [
      { id: "a", line: "L.94", number: "8", lat: 50.618, lon: 3.2841 },
      { id: "b", line: "L.94", number: "5 bis", lat: 0, lon: 0 },
      { id: "c", line: "L.90", number: "115", lat: 50.7, lon: 3.8 },
      { id: "d", line: "L.96", number: "1", lat: 50.5, lon: 4, infrabelId: "L-96-1" },
      { id: "e", line: "L.97", number: "3", lat: 50.4, lon: 3.9 },
    ];
    const m = matchCrossings(known, [
      infra("L-96-1", "L.96", "1", 50.5, 4),
      infra("L-94-8", "L.94", "8", 50.6181, 3.2842),
      infra("L-94-5BIS", "L.94", "5 bis", 50.61, 3.29),
      // renuméroté : 80 m du PN « c »
      infra("L-90-116", "L.90", "116", 50.7007, 3.8),
      // même position que « e » mais autre ligne : pas rapproché
      infra("L-96-30", "L.96", "30", 50.4, 3.9),
    ]);
    expect(Object.fromEntries(m.byInfrabel)).toEqual({
      "L-96-1": "d",
      "L-94-8": "a",
      "L-94-5BIS": "b",
      "L-90-116": "c",
    });
    expect(m.how.get("L-90-116")).toBe("proximite");
    expect(m.how.get("L-96-1")).toBe("id");
  });
  it("un PN connu n'est rapproché qu'une fois (le plus proche gagne)", () => {
    const known = [{ id: "x", line: "L.1", number: "9", lat: 50.5, lon: 4 }];
    const m = matchCrossings(known, [
      infra("L-1-10", "L.1", "10", 50.5009, 4),
      infra("L-1-11", "L.1", "11", 50.5003, 4),
    ]);
    expect(Object.fromEntries(m.byInfrabel)).toEqual({ "L-1-11": "x" });
  });
});

describe("BK estimée", () => {
  // Ligne droite vers l'est : gares tous les 10 km, km 0 / 20 aux extrémités, rien au milieu.
  const at = (x: number, y = 0) => fromLocal([x, y]);
  const line = [
    { ...at(0), km: 0 },
    { ...at(10), km: null },
    { ...at(20), km: 20 },
  ];
  it("interpole entre les gares à km connus", () => {
    expect(estimateBk(at(5, 0.3), line)).toBeCloseTo(5, 1);
    expect(estimateBk(at(15), line)).toBeCloseTo(15, 1);
  });
  it("recale sur les km Infrabel (km plus longs que la distance à vol d'oiseau)", () => {
    const l2 = [
      { ...at(0), km: 100 },
      { ...at(20), km: 124 },
    ];
    expect(estimateBk(at(10), l2)).toBeCloseTo(112, 1);
  });
  it("prolonge de 5 km au plus, refuse un point loin du tracé", () => {
    expect(estimateBk(at(23), line)).toBeCloseTo(23, 1);
    expect(estimateBk(at(30), line)).toBeNull();
    expect(estimateBk(at(10, 5), line)).toBeNull();
    expect(estimateBk(at(5), [{ ...at(0), km: 0 }, { ...at(20) }])).toBeNull();
  });
});

describe("BK par les bornes kilométriques", () => {
  const at = (x: number, y = 0) => fromLocal([x, y]);
  const csvRow = (line: string, name: string, x: number, y = 0) => {
    const g = at(x, y);
    return { linecalfa: line, name, geo_point_2d: `${g.lat}, ${g.lon}` };
  };
  it("regroupe les bornes par ligne (voies moyennées) et ignore les lignes techniques", () => {
    const m = kmPostsFrom([
      csvRow("94", "11", 1, 0.01),
      csvRow("94", "11", 1, -0.01),
      csvRow("94", "10", 0),
      csvRow("94/1", "3", 0),
      csvRow("", "3", 0),
      csvRow("90c", "x", 0),
    ]);
    expect([...m.keys()]).toEqual(["94"]);
    expect(m.get("94")!.map((p) => p.km)).toEqual([10, 11]);
    expect(toLocal(m.get("94")![1]!)[1]).toBeCloseTo(0, 4);
  });
  it("interpole entre les deux bornes qui encadrent le PN", () => {
    const posts = kmPostsFrom([
      csvRow("1", "10", 0),
      csvRow("1", "11", 1),
      csvRow("1", "12", 2),
      csvRow("1", "20", 10),
    ]).get("1")!;
    expect(bkFromPosts(at(1.25, 0.05), posts)).toBeCloseTo(11.25, 2);
    // trou de 8 km entre 12 et 20 : pas d'interpolation, point trop loin des segments gardés
    expect(bkFromPosts(at(6), posts)).toBeNull();
    expect(bkFromPosts(at(1, 0.5), posts)).toBeNull();
    expect(bkFromPosts(at(1), [])).toBeNull();
  });
});

describe("zones SPI", () => {
  const st = (
    key: string,
    x: number,
    y: number,
    extra: Partial<ZoneStation> = {},
  ): ZoneStation => ({
    key,
    name: key.toUpperCase(),
    ...fromLocal([x, y]),
    lines: ["1"],
    zone: "",
    source: "",
    ...extra,
  });
  const stations = [
    st("a", 0, 0),
    st("b", 5, 0),
    st("c", 10, 0),
    st("d", 15, 0),
    st("e", 40, 0, { lines: ["9"] }),
    st("f", 100, 100, { lines: [] }),
    st("m", 12, 1, { zone: "FMS", source: "manuel" }),
    st("x", 0, 0, { lat: 0, lon: 0, kind: "etranger" }),
  ];
  const lines = [{ line: "1", stations: [{ n: "A" }, { n: "B" }, { n: "C" }, { n: "D" }] }];
  it("carte, puis graphe le long des lignes, puis proximité ; manuel gardé", () => {
    const z = assignStationZones(stations, lines, { a: "FCR", d: "FTY", e: "XXX" }, [
      "FCR",
      "FTY",
      "FMS",
    ]);
    expect(z.get("a")).toEqual({ zone: "FCR", source: "carte" });
    expect(z.get("b")).toEqual({ zone: "FCR", source: "graphe" });
    expect(z.get("c")).toEqual({ zone: "FTY", source: "graphe" });
    expect(z.get("m")).toEqual({ zone: "FMS", source: "manuel" });
    // zone inconnue de la carte ignorée ; 25 km de la gare la plus proche (aucune ligne commune) → proximité
    expect(z.get("e")).toEqual({ zone: "FTY", source: "proximite" });
    expect(z.get("f")).toEqual({ zone: "", source: "" });
    expect(z.get("x")).toEqual({ zone: "", source: "" });
  });
  it("graphe : pas d'arête à travers un trou kilométrique, embranchement rattaché", () => {
    const g = lineGraph([
      {
        line: "2",
        stations: [{ n: "P" }, { n: "Q" }, { n: "R", g: 1 }, { n: "S", b: 1 }, { n: "T", b: 1 }],
        branches: [{ b: 1, from: "Q" }],
      },
    ]);
    expect([...(g.get("Q") ?? [])].sort()).toEqual(["P", "S"]);
    expect(g.get("R")).toBeUndefined();
    expect([...(g.get("T") ?? [])]).toEqual(["S"]);
  });
  it("zone d'un PN : gare de sa ligne d'abord", () => {
    const near = [
      { ...fromLocal([1, 0]), lines: ["2"], zone: "FMS" },
      { ...fromLocal([4, 0]), lines: ["1"], zone: "FCR" },
    ];
    expect(crossingZone({ ...fromLocal([0, 0]), line: "L.1" }, near)).toBe("FCR");
    expect(crossingZone({ ...fromLocal([0, 0]), line: "L.7" }, near)).toBe("FMS");
    expect(crossingZone({ lat: 0, lon: 0, line: "L.1" }, near)).toBe("");
  });
  it("zones d'un district", () => {
    expect([
      ...zonesOfDistricts(
        ["DSO"],
        [
          { code: "FMS", district: "DSO" },
          { code: "FNR", district: "DSE" },
        ],
      ),
    ]).toEqual(["FMS"]);
  });
});

describe("relevé de la carte des zones", () => {
  it("chaque zone relevée est une zone connue", async () => {
    const { SPI_SEED } = await import("./spi-seed");
    const { SPI_ZONE_DISTRICT } = await import("./spi");
    const values = Object.values(SPI_SEED);
    expect(values.length).toBeGreaterThan(600);
    expect(values.filter((z) => !(z in SPI_ZONE_DISTRICT))).toEqual([]);
    expect(SPI_SEED.mons).toBe("FMS");
    expect(SPI_SEED.tournai).toBe("FTY");
  });
});

describe("dessin des zones", () => {
  it("projection locale aller-retour et distances cohérentes", () => {
    const p = { lat: 50.45, lon: 3.95 };
    const back = fromLocal(toLocal(p));
    expect(back.lat).toBeCloseTo(p.lat, 9);
    expect(back.lon).toBeCloseTo(p.lon, 9);
    const q = fromLocal([toLocal(p)[0] + 10, toLocal(p)[1]]);
    expect(haversineKm(p, q)).toBeCloseTo(10, 1);
  });
  it("demi-plan : un carré coupé en deux", () => {
    const sq: [number, number][] = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ];
    const half = clipHalfPlane(sq, [1, 0], [1, 0]);
    expect(Math.abs(polygonArea(half))).toBeCloseTo(2, 9);
  });
  it("cellules : deux points se partagent la médiatrice", () => {
    const [a, b] = boundedCells(
      [
        [0, 0],
        [4, 0],
      ],
      6,
    );
    expect(Math.max(...a!.poly.map((p) => p[0]))).toBeCloseTo(2, 6);
    expect(Math.min(...b!.poly.map((p) => p[0]))).toBeCloseTo(2, 6);
    expect(a!.neighbors).toContain(1);
    expect(b!.neighbors).toContain(0);
  });
  it("formes : cellules par zone, frontière seulement entre zones différentes", () => {
    const pts = [
      { ...fromLocal([0, 0]), zone: "FMS" },
      { ...fromLocal([3, 0]), zone: "FMS" },
      { ...fromLocal([6, 0]), zone: "FCR" },
      { ...fromLocal([6.01, 0]), zone: "FTY" }, // à 10 m : fusionné
      { ...fromLocal([50, 0]), zone: "" },
    ];
    const s = zoneShapes(pts, 5);
    expect(Object.keys(s.cells).sort()).toEqual(["FCR", "FMS"]);
    expect(s.cells.FMS).toHaveLength(2);
    expect(s.borders).toHaveLength(1);
    expect(s.borders[0]!.zones).toEqual(["FMS", "FCR"]);
    const x = toLocal({ lat: s.borders[0]!.path[0][0], lon: s.borders[0]!.path[0][1] })[0];
    expect(x).toBeCloseTo(4.5, 2);
    expect(s.labels.FMS![0]).toBeCloseTo(fromLocal([1.5, 0]).lat, 4);
    // contour extérieur : côtés du disque, jamais la frontière partagée
    expect(s.outlines.FMS!.length).toBeGreaterThan(5);
    expect(s.outlines.FCR!.length).toBeGreaterThan(5);
    const gj = zoneGeoJson(s.cells.FCR!);
    expect(gj.type).toBe("MultiPolygon");
    expect(gj.coordinates[0]![0]![0]).toEqual(gj.coordinates[0]![0]!.at(-1));
  });
});
