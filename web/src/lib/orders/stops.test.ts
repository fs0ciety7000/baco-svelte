import { describe, expect, it } from "vitest";

import { routeBetween, stopsBetween, suggestLines } from "./stops";

const lines = [
  { line: "96", stations: ["Bruxelles-Midi", "Hal", "Braine-le-Comte", "Soignies", "Mons"] },
  { line: "97", stations: ["Mons", "Saint-Ghislain", "Quiévrain"] },
  { line: "78", stations: ["Saint-Ghislain", "Péruwelz", "Tournai"] },
];

describe("lignes et arrêts", () => {
  it("propose les lignes qui desservent les deux gares", () => {
    expect(suggestLines(lines, "Mons", "Hal")).toEqual(["96"]);
    expect(suggestLines(lines, "Mons", "Tournai")).toEqual(["96", "97", "78"]);
  });
  it("donne les arrêts intermédiaires dans le sens du trajet, accents ignorés", () => {
    expect(stopsBetween(lines, ["96"], "Hal", "Mons")).toEqual(["Braine-le-Comte", "Soignies"]);
    expect(stopsBetween(lines, ["96"], "mons", "hal")).toEqual(["Soignies", "Braine-le-Comte"]);
    expect(stopsBetween(lines, ["97"], "Mons", "Quievrain")).toEqual(["Saint-Ghislain"]);
  });
  it("ignore les lignes non choisies ou sans les deux gares", () => {
    expect(stopsBetween(lines, [], "Hal", "Mons")).toEqual([]);
    expect(stopsBetween(lines, ["78"], "Hal", "Mons")).toEqual([]);
  });
});

describe("correspondance tolérante des gares", () => {
  const lines = [
    { line: "L.96", stations: ["Bruxelles-Midi", "Hal", "Braine-le-Comte", "Soignies", "Mons"] },
  ];
  it("trouve lignes et arrêts malgré casse, accents et tirets", () => {
    expect(suggestLines(lines, "bruxelles midi", "MONS")).toEqual(["L.96"]);
    expect(stopsBetween(lines, ["L.96"], "mons", "Bruxelles Midi")).toEqual([
      "Soignies",
      "Braine-le-Comte",
      "Hal",
    ]);
  });
});

describe("routeBetween (itinéraire sur plusieurs lignes)", () => {
  const net = [
    { line: "L.118", stations: ["Mons", "Nimy", "Obourg", "Havré", "La Louvière-Centre"] },
    {
      line: "L.124",
      stations: [
        "Bruxelles-Midi",
        "Uccle",
        "Waterloo",
        "Braine-l'Alleud",
        "Nivelles",
        "Luttre",
        "Courcelles-Motte",
        "Charleroi-Central",
      ],
    },
    { line: "L.117", stations: ["La Louvière-Centre", "Manage", "Luttre"] },
    {
      line: "L.96",
      stations: [
        "Bruxelles-Midi",
        "Hal",
        "Tubize",
        "Braine-le-Comte",
        "Soignies",
        "Jurbise",
        "Mons",
      ],
    },
  ];
  it("enchaîne les lignes quand aucune ne dessert les deux gares", () => {
    const r = routeBetween(net, "Mons", "charleroi central");
    expect(r?.lines).toEqual(["L.118", "L.117", "L.124"]);
    // Bus direct : seulement les gares de correspondance.
    expect(r?.transfers).toEqual(["La Louvière-Centre", "Luttre"]);
    expect(r?.stops).toEqual([
      "Nimy",
      "Obourg",
      "Havré",
      "La Louvière-Centre",
      "Manage",
      "Luttre",
      "Courcelles-Motte",
    ]);
  });
  it("respecte les lignes cochées", () => {
    const r = routeBetween(net, "Mons", "Charleroi-Central", ["L.96", "L.124"]);
    expect(r?.lines).toEqual(["L.96", "L.124"]);
    expect(r?.stops.slice(0, 2)).toEqual(["Jurbise", "Soignies"]);
    expect(r?.stops).toContain("Bruxelles-Midi");
    expect(routeBetween(net, "Mons", "Charleroi-Central", ["L.118"])).toBeNull();
  });
  it("une seule ligne : aucune correspondance", () => {
    expect(routeBetween(net, "Mons", "Bruxelles-Midi")?.transfers).toEqual([]);
  });
  it("une seule ligne : mêmes arrêts que stopsBetween", () => {
    expect(routeBetween(net, "Mons", "Bruxelles-Midi")?.stops).toEqual([
      "Jurbise",
      "Soignies",
      "Braine-le-Comte",
      "Tubize",
      "Hal",
    ]);
  });
});
