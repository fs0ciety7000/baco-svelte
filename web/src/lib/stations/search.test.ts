import { describe, expect, it } from "vitest";

import {
  canonicalStation,
  foldStation,
  stationCandidates,
  stationMatches,
  stationMatchesAny,
  stationTerms,
  type StationRef,
} from "./search";

const REFS: StationRef[] = [
  { abbr: "FMS", names: ["Mons", "Bergen"] },
  { abbr: "GLG", names: ["Liège-Guillemins", "Luik-Guillemins"] },
  { abbr: "FBMZ", names: ["Bruxelles-Midi", "Brussel-Zuid"] },
  { abbr: "FAT", names: ["Ath", "Aat"] },
  { abbr: "LATS", names: ["Athus", "Athus"] },
  { abbr: "FCR", names: ["Charleroi-Central", "Charleroi-Centraal"] },
  { names: ["Écaussinnes"] },
];

describe("recherche de gare tolérante", () => {
  it("replie accents, casse et ponctuation", () => {
    expect(foldStation("Liège-Guillemins")).toBe("liege guillemins");
    expect(foldStation("  ÉCAUSSINNES ")).toBe("ecaussinnes");
    expect(foldStation("Bruxelles–Midi/Zuid")).toBe("bruxelles midi zuid");
  });

  it("compare sans accent, sans casse, tirets et espaces confondus", () => {
    expect(stationMatches("Liège-Guillemins", "liege")).toBe(true);
    expect(stationMatches("Bruxelles-Midi", "bruxelles midi")).toBe(true);
    expect(stationMatches("Bruxelles-Midi", "BRUXELLESMIDI")).toBe(true);
    expect(stationMatches("Écaussinnes", "ecaus")).toBe(true);
    expect(stationMatches("Mons", "namur")).toBe(false);
    expect(stationMatches("Mons", "")).toBe(true);
  });

  it("résout une abréviation PtCar en noms (exacte, casse ignorée)", () => {
    expect(stationCandidates("FMS", REFS)).toEqual(["Mons", "Bergen"]);
    expect(stationCandidates("fbmz", REFS)).toEqual(["Bruxelles-Midi", "Brussel-Zuid"]);
  });

  it("propose les noms accentués pour une saisie sans accent", () => {
    expect(stationCandidates("liege", REFS)).toEqual(["Liège-Guillemins"]);
    expect(stationCandidates("ecaussinnes", REFS)).toEqual(["Écaussinnes"]);
  });

  it("classe préfixe avant contenu, sans doublon, borné", () => {
    // « ath » : abréviation inconnue → noms qui commencent par « ath » (le plus court d'abord).
    expect(stationCandidates("ath", REFS)).toEqual(["Ath", "Athus"]);
    expect(stationCandidates("centra", REFS)).toEqual(["Charleroi-Central", "Charleroi-Centraal"]);
    expect(stationCandidates("central", REFS)).toEqual(["Charleroi-Central"]);
    expect(stationCandidates("char", REFS, 1)).toEqual(["Charleroi-Central"]);
    expect(stationCandidates("m", REFS)).toEqual([]);
  });

  it("termes de filtre : saisie brute d'abord, puis candidats sans doublon", () => {
    expect(stationTerms("FMS", ["Mons", "Bergen"])).toEqual(["FMS", "Mons", "Bergen"]);
    expect(stationTerms("mons", ["Mons"])).toEqual(["mons"]);
    expect(stationTerms("  ", ["Mons"])).toEqual([]);
    expect(stationTerms("x", ["a", "b", "c"], 2)).toEqual(["x", "a"]);
  });

  it("filtre en mémoire par l'un des termes", () => {
    const terms = stationTerms("FMS", stationCandidates("FMS", REFS));
    expect(stationMatchesAny("Mons", terms)).toBe(true);
    expect(stationMatchesAny("Bergen (Mons)", terms)).toBe(true);
    expect(stationMatchesAny("Namur", terms)).toBe(false);
    expect(stationMatchesAny("Namur", [])).toBe(true);
  });
});

describe("champ de gare des bons (nom retenu)", () => {
  const refs: StationRef[] = [
    ...REFS,
    { names: ["Maubeuge (FR)", "Maubeuge"] },
    { names: ["Mons-Nimy"] },
  ];

  it("propose le nom FR même quand la saisie correspond au nom NL ou à un alias", () => {
    expect(stationCandidates("Berg", refs, 8, true)).toEqual(["Mons"]);
    expect(stationCandidates("maubeu", refs, 8, true)).toEqual(["Maubeuge (FR)"]);
    expect(stationCandidates("FCR", refs, 8, true)).toEqual(["Charleroi-Central"]);
    // Une gare n'apparaît qu'une fois, préfixe avant contenu.
    expect(stationCandidates("mons", refs, 8, true)).toEqual(["Mons", "Mons-Nimy"]);
  });

  it("ramène une saisie exacte au nom retenu ; garde une saisie libre", () => {
    expect(canonicalStation("bergen", refs)).toBe("Mons");
    expect(canonicalStation("Maubeuge", refs)).toBe("Maubeuge (FR)");
    expect(canonicalStation("charleroi centraal", refs)).toBe("Charleroi-Central");
    expect(canonicalStation("fms", refs)).toBe("Mons");
    expect(canonicalStation("Dépôt de Saint-Ghislain", refs)).toBe("Dépôt de Saint-Ghislain");
    expect(canonicalStation("", refs)).toBe("");
  });
});
