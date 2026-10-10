import { describe, expect, it } from "vitest";

import { missionImpact, stopAt, trainKey, type TrainStates } from "./train-delay";

const state = {
  delay: 7,
  cancelled: false,
  checkedAt: "",
  stops: [
    {
      st: "Bruxelles-Midi",
      alt: "Brussel-Zuid/Bruxelles-Midi",
      t: "08:00",
      d: 1,
      c: false,
      l: true,
    },
    { st: "Braine-le-Comte", t: "08:20", d: 7, c: false, l: false },
    { st: "Mons", t: "08:40", d: 12, c: false, l: false },
    { st: "Quévy", t: "08:55", d: 0, c: true, l: false },
    { st: "Athus", t: "09:30", d: 0, da: 20, c: false, l: false },
  ],
};
const states: TrainStates = { "2026-10-10|IC2108": state };
const base = {
  day: "2026-10-10",
  train: "IC 2108",
  transport: "train",
  station: "Bruxelles-Midi",
  otherStation: "Mons",
  inAssist: false,
  outAssist: true,
};

describe("retards des trains de mission", () => {
  it("clé jour + train normalisé", () => {
    expect(trainKey("2026-10-10", "ic 2108")).toBe("2026-10-10|IC2108");
    expect(trainKey("2026-10-10", "taxi")).toBe("");
  });
  it("trouve l'arrêt sans accent ni casse", () => {
    expect(stopAt(state, "QUEVY")?.c).toBe(true);
    expect(stopAt(state, "Bruxelles Midi")?.t).toBe("08:00");
    expect(stopAt(state, "Namur")).toBeNull();
    expect(stopAt(state, "Brussel Zuid")?.t).toBe("08:00");
    expect(stopAt(state, "Ath")).toBeNull();
  });
  it("retard à la gare d'arrivée pour un débarquement", () => {
    expect(missionImpact(base, states)).toEqual({
      delay: 12,
      cancelled: false,
      station: "Mons",
      left: false,
    });
  });
  it("à l'heure au départ : pas d'impact pour un embarquement", () => {
    expect(missionImpact({ ...base, inAssist: true, outAssist: false }, states)).toBeNull();
  });
  it("suppression prioritaire sur le retard", () => {
    expect(
      missionImpact({ ...base, inAssist: true, otherStation: "Quévy" }, states)?.cancelled,
    ).toBe(true);
  });
  it("débarquement au terminus : retard à l'arrivée", () => {
    expect(missionImpact({ ...base, otherStation: "Athus" }, states)?.delay).toBe(20);
    expect(
      missionImpact({ ...base, station: "Athus", inAssist: true, outAssist: false }, states),
    ).toBeNull();
  });
  it("taxi ou train non suivi : rien", () => {
    expect(missionImpact({ ...base, transport: "taxi" }, states)).toBeNull();
    expect(missionImpact({ ...base, train: "999" }, states)).toBeNull();
  });
});
