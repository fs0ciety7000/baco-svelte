import { describe, expect, it } from "vitest";

import { lineId, sameLine } from "./stops";
import {
  dayBit,
  keysOf,
  legOf,
  mergeOrder,
  pickVariant,
  reverseLegOf,
  stationsFromTrain,
  trainRoute,
  type RouteTrain,
} from "./train-route";

// Trains fictifs inspirés de Mons → Charleroi-Central (L.118, L.112, L.124A) et de l'IC 1706 (Quiévrain → Bruxelles).
const omnibus: RouteTrain = {
  number: 4456,
  type: "L",
  relation: "L26",
  origin: "Quévy",
  terminus: "Charleroi-Central",
  days: 31,
  stops: [
    { n: "Quévy", d: "06:30", l: "96" },
    { n: "Mons", t: "Bergen", a: "06:53", d: "06:55", l: "118" },
    { n: "Nimy", a: "06:58", d: "06:58", l: "118" },
    { n: "Obourg-Marchandises", p: 1, l: "118" },
    { n: "Havré", a: "07:03", d: "07:03", l: "118" },
    { n: "La Louvière-Sud", a: "07:15", d: "07:16", l: "112" },
    { n: "Marchienne-au-Pont", a: "07:36", d: "07:36", l: "124A" },
    { n: "Charleroi-Central", t: "Charleroi-Centraal", a: "07:44" },
  ],
};
const ic: RouteTrain = {
  number: 905,
  type: "IC",
  relation: "IC19-1",
  origin: "Mons",
  terminus: "Namur",
  days: 127,
  stops: [
    { n: "Mons", t: "Bergen", d: "06:15", l: "118" },
    { n: "Nimy", p: 1, l: "118" },
    { n: "Havré", p: 1, l: "118" },
    { n: "La Louvière-Sud", a: "06:30", d: "06:31", l: "112" },
    { n: "Marchienne-au-Pont", p: 1, l: "124A" },
    { n: "Charleroi-Central", a: "06:47", d: "06:50", l: "130" },
    { n: "Namur", a: "07:20" },
  ],
};
// Sens inverse, sans omnibus : seul un IC relie Charleroi-Central à Mons dans ce sens.
const icBack: RouteTrain = {
  ...ic,
  number: 926,
  origin: "Namur",
  terminus: "Mons",
  stops: [
    { n: "Namur", d: "07:40", l: "130" },
    { n: "Charleroi-Central", a: "08:10", d: "08:13", l: "124A" },
    { n: "Marchienne-au-Pont", p: 1, l: "112" },
    { n: "La Louvière-Sud", a: "08:30", d: "08:31", l: "118" },
    { n: "Havré", p: 1, l: "118" },
    { n: "Mons", a: "08:44" },
  ],
};
const ic1706: RouteTrain = {
  number: 1706,
  type: "IC",
  relation: "IC14",
  origin: "Quiévrain",
  terminus: "Bruxelles-Midi",
  days: 31,
  stops: [
    { n: "Quiévrain", d: "06:11", l: "97" },
    { n: "Saint-Ghislain", a: "06:27", d: "06:31", l: "97" },
    { n: "Mons", t: "Bergen", a: "06:45", d: "06:50", l: "96" },
    { n: "Ghlin", p: 1, l: "96" },
    { n: "Soignies", t: "Zinnik", a: "07:08", d: "07:09", l: "96" },
    { n: "Hal", t: "Halle", a: "07:25", d: "07:26", l: "96" },
    { n: "Bruxelles-Midi", t: "Brussel-Zuid", a: "07:36", l: "0" },
  ],
};

const MONS = keysOf("Mons");
const CHARLEROI = keysOf("Charleroi-Central");

describe("trajet d'un bon tiré des trains", () => {
  it("lit le trajet d'un train entre deux gares (lignes, arrêts, passages)", () => {
    const leg = legOf(omnibus, MONS, CHARLEROI)!;
    expect(leg.lines).toEqual(["118", "112", "124A"]);
    expect(leg.stops).toEqual(["Nimy", "Havré", "La Louvière-Sud", "Marchienne-au-Pont"]);
    expect(leg.points).toContain("Obourg-Marchandises");
    expect([leg.depTime, leg.arrTime]).toEqual(["06:55", "07:44"]);
    // Nom NL accepté, sens inverse refusé.
    expect(legOf(omnibus, keysOf("Bergen"), keysOf("charleroi centraal"))?.from).toBe("Mons");
    expect(legOf(omnibus, CHARLEROI, MONS)).toBeNull();
  });

  it("retourne un train de sens inverse (sans heures)", () => {
    const leg = reverseLegOf(omnibus, CHARLEROI, MONS)!;
    expect(leg.stops).toEqual(["Marchienne-au-Pont", "La Louvière-Sud", "Havré", "Nimy"]);
    expect(leg.lines).toEqual(["124A", "112", "118"]);
    expect([leg.from, leg.to, leg.depTime, leg.reversed]).toEqual([
      "Charleroi-Central",
      "Mons",
      "",
      true,
    ]);
  });

  it("omnibus = le plus d'arrêts (L d'abord), direct = l'IC le moins arrêté, propositions = union ordonnée", () => {
    const r = trainRoute([ic, omnibus, ic1706], MONS, CHARLEROI)!;
    expect(r.omnibus.number).toBe(4456);
    expect(r.direct.number).toBe(905);
    expect(r.direct.stops).toEqual(["La Louvière-Sud"]);
    expect(r.proposed).toEqual(["Nimy", "Havré", "La Louvière-Sud", "Marchienne-au-Pont"]);
    expect(r.trains).toBe(2);
  });

  it("prend le train de sens inverse quand aucun omnibus ne roule dans le bon sens", () => {
    const r = trainRoute([omnibus, icBack], CHARLEROI, MONS)!;
    expect(r.direct.number).toBe(926);
    expect(r.omnibus.number).toBe(4456);
    expect(r.omnibus.reversed).toBe(true);
    expect(r.proposed).toEqual(["Marchienne-au-Pont", "La Louvière-Sud", "Havré", "Nimy"]);
    expect(trainRoute([ic1706], MONS, CHARLEROI)).toBeNull();
  });

  it("garde les trains du jour du bon s'il y en a", () => {
    const weekend = { ...omnibus, number: 4499, days: 96 };
    expect(
      trainRoute([omnibus, weekend], MONS, CHARLEROI, dayBit("2026-10-17"))?.omnibus.number,
    ).toBe(4499);
    expect(
      trainRoute([omnibus, weekend], MONS, CHARLEROI, dayBit("2026-10-14"))?.omnibus.number,
    ).toBe(4456);
  });

  it("bit du jour et variante d'un n° de train", () => {
    expect(dayBit("2026-10-12")).toBe(1); // lundi
    expect(dayBit("2026-10-18")).toBe(64); // dimanche
    expect(dayBit("")).toBe(0);
    const v = [
      { id: "semaine", days: 31 },
      { id: "dimanche", days: 64 },
    ];
    expect(pickVariant(v, 64)?.id).toBe("dimanche");
    expect(pickVariant(v, 1)?.id).toBe("semaine");
    expect(pickVariant(v, 0)?.id).toBe("semaine");
    expect(pickVariant([], 1)).toBeNull();
  });

  it("fusionne les ordres de plusieurs trajets", () => {
    expect(
      mergeOrder([
        ["A", "C", "E"],
        ["A", "B", "C", "D", "E"],
      ]),
    ).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("pré-remplit les gares d'un bon depuis un n° de train", () => {
    // Bon vide : origine et terminus du train.
    const all = stationsFromTrain(ic1706, "", "");
    expect([all.origin, all.destination]).toEqual(["Quiévrain", "Bruxelles-Midi"]);
    expect(all.leg?.lines).toEqual(["97", "96"]);
    // Gares du rédacteur gardées si le train y passe dans l'ordre (nom NL accepté, nom FR retenu).
    const kept = stationsFromTrain(ic1706, "Bergen", "Hal");
    expect([kept.origin, kept.destination]).toEqual(["Mons", "Hal"]);
    expect(kept.leg?.stops).toEqual(["Soignies"]);
    expect(kept.leg?.depTime).toBe("06:50");
    // Départ connu seulement : terminus du train ; arrivée connue seulement : origine du train.
    expect(stationsFromTrain(ic1706, "Mons", "").destination).toBe("Bruxelles-Midi");
    expect(stationsFromTrain(ic1706, "", "Soignies").origin).toBe("Quiévrain");
    // Gares hors du train : remplacées.
    expect(stationsFromTrain(ic1706, "Namur", "Liège").origin).toBe("Quiévrain");
  });

  it("une ligne s'écrit « 96 » ou « L.96 »", () => {
    expect(lineId("L.96")).toBe("96");
    expect(lineId("l 124a")).toBe("124A");
    expect(sameLine(["L.96", "97"], "96")).toBe(true);
    expect(sameLine(["97"], "L.96")).toBe(false);
  });
});
