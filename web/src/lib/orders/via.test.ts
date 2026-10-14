import { describe, expect, it } from "vitest";

import { taxiDraftSchema } from "./schemas";
import { cleanVias, moveVia, routeWithVias, viaList, viaText } from "./via";

describe("gares via d'un bon taxi (14 oct. 2026)", () => {
  it("lit la liste JSON, sinon l'ancien texte comme une seule étape", () => {
    expect(
      viaList({ via_stations: ["Frameries", "Ghlin"], via_station: "Frameries · Ghlin" }),
    ).toEqual(["Frameries", "Ghlin"]);
    expect(viaList({ via_stations: '["Ath"]' })).toEqual(["Ath"]);
    expect(viaList({ via_stations: null, via_station: "Frameries ghlin" })).toEqual([
      "Frameries ghlin",
    ]);
    expect(viaList({ via_stations: [], via_station: "  " })).toEqual([]);
    expect(viaList({ via_stations: "{cassé" })).toEqual([]);
  });

  it("retire les lignes vides, borne à 10 étapes, joint pour la recherche", () => {
    expect(cleanVias([" Frameries ", "", 3, "Ghlin"])).toEqual(["Frameries", "Ghlin"]);
    expect(cleanVias(Array.from({ length: 12 }, (_, i) => `G${i}`))).toHaveLength(10);
    expect(viaText(["Frameries", "", "Ghlin"])).toBe("Frameries · Ghlin");
    expect(routeWithVias("Mons", ["Frameries", "Ghlin"], "Tournai")).toBe(
      "Mons → Frameries → Ghlin → Tournai",
    );
    expect(routeWithVias("", [], "")).toBe("? → ?");
  });

  it("monte et descend une étape, sans sortir des bornes", () => {
    expect(moveVia(["A", "B", "C"], 1, -1)).toEqual(["B", "A", "C"]);
    expect(moveVia(["A", "B", "C"], 1, 1)).toEqual(["A", "C", "B"]);
    expect(moveVia(["A", "B"], 0, -1)).toEqual(["A", "B"]);
    expect(moveVia(["A", "B"], 1, 1)).toEqual(["A", "B"]);
  });

  it("ancien brouillon ou modèle (via_station texte) → via_stations", () => {
    expect(taxiDraftSchema.parse({ via_station: "Ath" }).via_stations).toEqual(["Ath"]);
    expect(taxiDraftSchema.parse({ via_station: "" }).via_stations).toEqual([]);
    expect(
      taxiDraftSchema.parse({ via_stations: ["A", "B"], via_station: "X" }).via_stations,
    ).toEqual(["A", "B"]);
    expect(taxiDraftSchema.parse({}).via_stations).toEqual([]);
  });
});
