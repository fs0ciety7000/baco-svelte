import { describe, expect, it } from "vitest";

import { countByZone, filterZoneStations, NO_ZONE, pnMapHref, tallyZones } from "./spi-view";

const st = (name: string, zone: string, kind = "gare", lines: string[] = []) => ({
  name,
  zone,
  kind,
  lines,
});
const stations = [
  st("Mons", "FMS", "gare", ["96", "118"]),
  st("Jemappes", "FMS", "gare", ["97"]),
  st("Bif. Saint-Ghislain", "FMS", "pang", ["97"]),
  st("Liège-Guillemins", "FLG", "gare", ["36"]),
  st("Aachen Hbf", "", "etranger", ["37"]),
];

describe("comptages par zone SPI", () => {
  it("compte gares et PANG par zone, sans zone à part", () => {
    const t = tallyZones(stations);
    expect(t.get("FMS")).toEqual({ stations: 3, gares: 2, pang: 1 });
    expect(t.get("FLG")).toEqual({ stations: 1, gares: 1, pang: 0 });
    expect(t.get("")).toEqual({ stations: 1, gares: 1, pang: 0 });
  });

  it("compte les PN par zone", () => {
    expect(countByZone([{ zone: "FMS" }, { zone: "FMS" }, { zone: "" }])).toEqual({
      FMS: 2,
      "": 1,
    });
  });
});

describe("filtre des gares d'une zone", () => {
  it("filtre par zone et sans zone", () => {
    expect(filterZoneStations(stations, { q: "", zone: "FLG" }).map((s) => s.name)).toEqual([
      "Liège-Guillemins",
    ]);
    expect(filterZoneStations(stations, { q: "", zone: NO_ZONE }).map((s) => s.name)).toEqual([
      "Aachen Hbf",
    ]);
    expect(filterZoneStations(stations, { q: "", zone: "" })).toHaveLength(5);
  });

  it("cherche sans accent ni casse, et par numéro de ligne", () => {
    expect(filterZoneStations(stations, { q: "liege", zone: "" }).map((s) => s.name)).toEqual([
      "Liège-Guillemins",
    ]);
    expect(filterZoneStations(stations, { q: "L.97", zone: "FMS" }).map((s) => s.name)).toEqual([
      "Jemappes",
      "Bif. Saint-Ghislain",
    ]);
    expect(filterZoneStations(stations, { q: "96", zone: "" }).map((s) => s.name)).toEqual([
      "Mons",
    ]);
  });
});

describe("lien vers la Carte PN", () => {
  it("filtre la zone et affiche la couche", () => {
    expect(pnMapHref("FMS")).toBe("/reseau/pn?zone=FMS&zones=1");
  });
});
