import { describe, expect, it } from "vitest";

import { dicosChanges, type ChangeSnapshot } from "./dicos-changes";

const TODAY = "2026-10-11";
const NOW = 10 * 60; // 10:00

const m = (over: Partial<ChangeSnapshot> = {}): ChangeSnapshot => ({
  day: TODAY,
  status: "prevue",
  time: "11:00",
  arr_time: "12:00",
  station: "Mons",
  other_station: "Bruxelles-Midi",
  district: "DSO",
  arr_district: "",
  in_assist: true,
  out_assist: false,
  ...over,
});

describe("dicosChanges", () => {
  it("nouvelle mission dans les 3 h, seulement après une synchro complète du jour", () => {
    expect(dicosChanges(null, m(), TODAY, NOW, false)).toEqual([]);
    expect(dicosChanges(null, m(), TODAY, NOW, true)).toEqual([
      { change: "new", io: "IN", station: "Mons", time: "11:00", from: "", district: "DSO" },
    ]);
  });
  it("hors fenêtre : au-delà de 3 h, déjà passée, autre jour", () => {
    expect(dicosChanges(null, m({ time: "13:01" }), TODAY, NOW, true)).toEqual([]);
    expect(dicosChanges(null, m({ time: "09:59" }), TODAY, NOW, true)).toEqual([]);
    expect(dicosChanges(null, m({ day: "2026-10-12" }), TODAY, NOW, true)).toEqual([]);
  });
  it("annulation dans les 3 h (heure d'avant)", () => {
    const out = dicosChanges(m(), m({ status: "annulee" }), TODAY, NOW, false);
    expect(out.map((c) => c.change)).toEqual(["cancelled"]);
  });
  it("changement d'heure : nouvelle ou ancienne heure dans la fenêtre", () => {
    expect(dicosChanges(m({ time: "15:00" }), m({ time: "11:30" }), TODAY, NOW, false)).toEqual([
      { change: "time", io: "IN", station: "Mons", time: "11:30", from: "15:00", district: "DSO" },
    ]);
    expect(
      dicosChanges(m({ time: "11:00" }), m({ time: "16:00" }), TODAY, NOW, false)[0]?.change,
    ).toBe("time");
    expect(dicosChanges(m({ time: "15:00" }), m({ time: "16:00" }), TODAY, NOW, false)).toEqual([]);
  });
  it("débarquement : heure et district de la gare d'arrivée", () => {
    const before = m({ in_assist: false, out_assist: true, arr_district: "DCE" });
    const out = dicosChanges(before, { ...before, arr_time: "12:20" }, TODAY, NOW, false);
    expect(out).toEqual([
      {
        change: "time",
        io: "OUT",
        station: "Bruxelles-Midi",
        time: "12:20",
        from: "12:00",
        district: "DCE",
      },
    ]);
  });
  it("assistance ajoutée ou retirée sur un bout", () => {
    const both = m({ out_assist: true, arr_district: "DCE" });
    expect(dicosChanges(m(), both, TODAY, NOW, false).map((c) => `${c.change}:${c.io}`)).toEqual([
      "new:OUT",
    ]);
    expect(dicosChanges(both, m(), TODAY, NOW, false).map((c) => `${c.change}:${c.io}`)).toEqual([
      "cancelled:OUT",
    ]);
  });
  it("rien sans changement, ni pour une mission réalisée", () => {
    expect(dicosChanges(m(), m(), TODAY, NOW, true)).toEqual([]);
    expect(dicosChanges(m(), m({ status: "realisee", time: "11:30" }), TODAY, NOW, true)).toEqual(
      [],
    );
  });
  it("mission rétablie (annulée → prévue) : comme une nouvelle", () => {
    expect(
      dicosChanges(m({ status: "annulee" }), m(), TODAY, NOW, false).map((c) => c.change),
    ).toEqual(["new"]);
  });
});
