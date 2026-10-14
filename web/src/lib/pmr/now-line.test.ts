import { describe, expect, it } from "vitest";

import {
  brusselsMinutes,
  dayPhase,
  indexAtMinute,
  nowSplit,
  stripBuckets,
  stripPct,
  stripRange,
  stripTicks,
  untilLabel,
} from "./now-line";

const hm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

describe("repère « maintenant »", () => {
  it("minutes de Bruxelles (heure d'été / d'hiver)", () => {
    expect(brusselsMinutes(new Date("2026-10-15T11:42:00Z"))).toBe(hm("13:42"));
    expect(brusselsMinutes(new Date("2026-12-15T11:42:00Z"))).toBe(hm("12:42"));
  });

  it("phase du jour", () => {
    expect(dayPhase("2026-10-14", "2026-10-15")).toBe("past");
    expect(dayPhase("2026-10-15", "2026-10-15")).toBe("today");
    expect(dayPhase("2026-10-16", "2026-10-15")).toBe("future");
  });

  const items = [
    { start: "06:00", end: "07:25" },
    { start: "08:10" },
    { start: "12:30", end: "14:10" },
    { start: "13:50" },
    { start: "" },
  ];

  it("aujourd'hui : repère avant la première mission à venir, passées estompées, débarquement à venir non estompé", () => {
    const s = nowSplit(items, hm("13:42"), "today");
    expect(s.insertAt).toBe(3);
    expect(s.next).toBe(3);
    expect(s.past).toEqual([true, true, false, false, false]);
  });

  it("tout est passé : repère en fin de liste, plus de prochaine", () => {
    const s = nowSplit(items.slice(0, 2), hm("23:00"), "today");
    expect(s).toEqual({ insertAt: 2, next: -1, past: [true, true] });
  });

  it("avant la première : repère en tête", () => {
    expect(nowSplit(items, hm("05:00"), "today").insertAt).toBe(0);
  });

  it("autre jour : pas de repère ; jour passé tout estompé", () => {
    expect(nowSplit(items, 0, "past")).toEqual({
      insertAt: -1,
      next: -1,
      past: [true, true, true, true, true],
    });
    expect(nowSplit(items, 0, "future").past.every((p) => !p)).toBe(true);
  });

  it("délai jusqu'à la prochaine", () => {
    expect(untilLabel("13:50", hm("13:42"))).toBe("dans 8 min");
    expect(untilLabel("15:07", hm("13:42"))).toBe("dans 1 h 25");
    expect(untilLabel("13:42", hm("13:42"))).toBe("maintenant");
    expect(untilLabel("13:00", hm("13:42"))).toBe("");
    expect(untilLabel("", hm("13:42"))).toBe("");
  });
});

describe("mini-frise de la journée", () => {
  it("plage 6 h – 22 h, élargie aux heures pleines", () => {
    expect(stripRange(["08:00"])).toEqual({ from: 360, to: 1320 });
    expect(stripRange(["05:10", "22:40", ""])).toEqual({ from: 300, to: 1380 });
  });

  it("densité par demi-heure, hors plage ignoré", () => {
    const r = { from: 360, to: 480 };
    expect(stripBuckets(["06:00", "06:29", "06:30", "07:59", "08:00", "05:00"], r)).toEqual([
      { from: 360, to: 390, count: 2 },
      { from: 390, to: 420, count: 1 },
      { from: 420, to: 450, count: 0 },
      { from: 450, to: 480, count: 1 },
    ]);
  });

  it("position, graduations et ligne visée par un clic", () => {
    const r = { from: 360, to: 1320 };
    expect(stripPct(840, r)).toBe(50);
    expect(stripPct(0, r)).toBe(0);
    expect(stripPct(2000, r)).toBe(100);
    expect(stripTicks(r).map((t) => t.label)).toEqual([
      "06",
      "08",
      "10",
      "12",
      "14",
      "16",
      "18",
      "20",
      "22",
    ]);
    expect(indexAtMinute(["06:00", "08:10", "12:30"], hm("08:00"))).toBe(1);
    expect(indexAtMinute(["06:00", "08:10"], hm("23:00"))).toBe(1);
    expect(indexAtMinute([], 0)).toBe(-1);
  });
});
