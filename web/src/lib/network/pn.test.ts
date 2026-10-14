import { describe, expect, it } from "vitest";

import {
  bkLabel,
  clusterPoints,
  compareByBk,
  compareByNumber,
  filterCrossings,
  matchCrossing,
  PN_NUMBER_RE,
  pnNumber,
  worldPx,
  type PnLike,
} from "./pn";

const pn = (o: Partial<PnLike>): PnLike => ({
  id: "x",
  line: "L.94",
  number: "12",
  bk: 0,
  address: "Rue de la Station, 7860 Lessines",
  commune: "7860 Lessines",
  zone: "FTY",
  lat: 50.7,
  lon: 3.8,
  ...o,
});

describe("recherche de PN", () => {
  it("numéro, ligne, combinaisons et n° Infrabel", () => {
    const c = pn({ number: "7 bis", line: "L.90C" });
    expect(matchCrossing(c, "7 bis")).toBe(true);
    expect(matchCrossing(c, "7bis")).toBe(true);
    expect(matchCrossing(c, "PN 7 bis L90C")).toBe(true);
    expect(matchCrossing(c, "L.90C")).toBe(true);
    expect(matchCrossing(c, "L.90")).toBe(false);
    expect(matchCrossing(c, "7")).toBe(false);
    expect(matchCrossing(pn({ number: "14", line: "L.36" }), "L-36-14")).toBe(true);
    expect(matchCrossing(pn({ number: "12A" }), "12a")).toBe(true);
  });
  it("mots de l'adresse, de la commune ou de la zone (accents ignorés)", () => {
    expect(matchCrossing(pn({}), "lessines station")).toBe(true);
    expect(matchCrossing(pn({ address: "", commune: "7700 Mouscron" }), "MOUSCRON")).toBe(true);
    expect(matchCrossing(pn({ address: "Rue de l'Église" }), "eglise")).toBe(true);
    expect(matchCrossing(pn({}), "fty")).toBe(true);
    expect(matchCrossing(pn({}), "tournai")).toBe(false);
  });
  it("filtres zone et ligne", () => {
    const list = [pn({ id: "a" }), pn({ id: "b", zone: "FMS" }), pn({ id: "c", line: "L.96" })];
    expect(filterCrossings(list, { zones: new Set(["FTY"]) }).map((c) => c.id)).toEqual(["a", "c"]);
    expect(filterCrossings(list, { lines: new Set(["L.96"]) }).map((c) => c.id)).toEqual(["c"]);
    expect(filterCrossings(list, {}).length).toBe(3);
  });
});

describe("tri et BK", () => {
  it("par numéro et le long de la ligne", () => {
    const list = [
      pn({ id: "a", number: "12", bk: 30 }),
      pn({ id: "b", number: "9 bis", bk: 0 }),
      pn({ id: "c", number: "9", bk: 25.5 }),
      pn({ id: "d", line: "L.75A", number: "1", bk: 2 }),
    ];
    expect([...list].sort(compareByNumber).map((c) => c.id)).toEqual(["d", "c", "b", "a"]);
    expect([...list].sort(compareByBk).map((c) => c.id)).toEqual(["d", "c", "a", "b"]);
  });
  it("numéro saisi", () => {
    expect(pnNumber("PN 12 bis")).toBe("12 bis");
    expect(pnNumber("12Bis")).toBe("12 bis");
    expect(pnNumber("12a")).toBe("12A");
    expect(pnNumber("007")).toBe("7");
    expect(PN_NUMBER_RE.test(pnNumber("12 quater!"))).toBe(false);
  });
  it("BK affichée", () => {
    expect(bkLabel(12.345, false)).toBe("12.345");
    expect(bkLabel(12.345, true)).toBe("≈ 12.3");
    expect(bkLabel(0, true)).toBe("—");
  });
});

describe("regroupement des marqueurs", () => {
  const pts = [
    { id: "a", lat: 50.5, lon: 4 },
    { id: "b", lat: 50.5005, lon: 4.0005 },
    { id: "c", lat: 50.9, lon: 5 },
  ];
  it("regroupe les voisins à faible zoom, jamais au-delà du seuil", () => {
    const low = clusterPoints(pts, 8);
    expect(low.filter((c) => c.kind === "cluster")).toHaveLength(1);
    const cl = low.find((c) => c.kind === "cluster");
    expect(cl && cl.kind === "cluster" && cl.count).toBe(2);
    expect(clusterPoints(pts, 13).every((c) => c.kind === "point")).toBe(true);
  });
  it("le point sélectionné reste seul", () => {
    const low = clusterPoints(pts, 8, { keep: "a" });
    expect(low.filter((c) => c.kind === "point").map((c) => c.kind === "point" && c.item.id)).toContain("a");
    expect(low.some((c) => c.kind === "cluster")).toBe(false);
  });
  it("projection Web Mercator", () => {
    expect(worldPx(0, 0, 0)).toEqual([128, 128]);
    const [x, y] = worldPx(50.5, 4, 10);
    expect(x).toBeGreaterThan(128 * 1024);
    expect(y).toBeLessThan(128 * 1024);
  });
});
