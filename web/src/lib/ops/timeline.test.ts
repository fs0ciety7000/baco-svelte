import { describe, expect, it } from "vitest";

import { hourRange, nextIndex, packLanes, span, toMinutes, type TimelineItem } from "./timeline";

const item = (id: string, start: string, end = "", delay = 0): TimelineItem => ({
  id,
  kind: "pmr",
  start,
  end,
  train: "IC 1",
  title: "",
  detail: "",
  io: "IN",
  station: "Mons",
  district: "DSO",
  impact: delay ? { delay, cancelled: false, station: "Mons", left: false } : null,
  href: "/pmr",
});

describe("frise Ma journée", () => {
  it("convertit les heures", () => {
    expect(toMinutes("07:05")).toBe(425);
    expect(toMinutes("")).toBeNull();
    expect(toMinutes("ab")).toBeNull();
  });

  it("compte le retard dans l'intervalle occupé", () => {
    expect(span(item("a", "08:00"))).toEqual({ a: 480, b: 525 });
    expect(span(item("a", "08:00", "", 30))).toEqual({ a: 480, b: 555 });
    expect(span(item("a", "08:00", "09:00"))).toEqual({ a: 480, b: 540 });
    expect(span(item("a", ""))).toBeNull();
  });

  it("élargit la plage aux éléments du jour", () => {
    expect(hourRange([])).toEqual({ from: 360, to: 1320 });
    expect(hourRange([item("a", "05:10"), item("b", "23:30")])).toEqual({ from: 300, to: 1440 });
  });

  it("répartit les chevauchements sur plusieurs pistes", () => {
    const lanes = packLanes([item("a", "08:00"), item("b", "08:10"), item("c", "08:50")]);
    expect(lanes.map((l) => [l.item.id, l.lane])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 0],
    ]);
  });

  it("trouve le prochain élément, retard compris", () => {
    const items = [item("a", "08:00"), item("b", "08:00", "", 20), item("c", "09:00")];
    expect(nextIndex(items, 8 * 60 + 10)).toBe(1);
    expect(nextIndex(items, 10 * 60)).toBe(-1);
  });
});
