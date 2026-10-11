import { describe, expect, it } from "vitest";

import { stopsBetween, suggestLines } from "./stops";

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
