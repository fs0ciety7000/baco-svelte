import { describe, expect, it } from "vitest";

import { parseDicos } from "./dicos";

// Exemples fictifs (formats observés dans la v1, sans aucune donnée réelle).
describe("parseDicos", () => {
  it("format courant, aller-retour = deux segments, le nom n'est pas repris", () => {
    const p = parseDicos("1234-56-78-9012 1 NV OUT E 2134 à 16h42 Dupont Jean IN E 5678 à 19h05");
    expect(p).toMatchObject({ ref: "1234-56-78-9012", pax: 1, type: "NV" });
    expect(p.segments).toEqual([
      { direction: "depart", train: "E2134", time: "16:42" },
      { direction: "arrivee", train: "E5678", time: "19:05" },
    ]);
    expect(JSON.stringify(p)).not.toContain("Dupont");
  });
  it("collé sans espaces et heure à un chiffre", () => {
    const p = parseDicos("1234-56-78-9012 2CRF IN E987 à 8h05");
    expect(p).toMatchObject({ pax: 2, type: "CRF" });
    expect(p.segments).toEqual([{ direction: "arrivee", train: "E987", time: "08:05" }]);
  });
  it("train avant le sens (repli)", () => {
    const p = parseDicos("E4567 1MR OUT à 10h15 - 1234-56-78-9012");
    expect(p).toMatchObject({ ref: "1234-56-78-9012", type: "MR" });
    expect(p.segments).toEqual([{ direction: "depart", train: "E4567", time: "10:15" }]);
  });
  it("CR devient AUTRE ; texte sans heure : aucun segment", () => {
    expect(parseDicos("1234-56-78-9012 1 CR OUT").type).toBe("AUTRE");
    expect(parseDicos("texte libre").segments).toEqual([]);
  });
});
