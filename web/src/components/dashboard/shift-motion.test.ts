import { describe, expect, it } from "vitest";

import { hourTicks } from "./shift-motion";

describe("hourTicks", () => {
  it("heures pleines strictement dans le service, en part de la durée", () => {
    const start = new Date("2026-11-05T05:00:00Z");
    const end = new Date("2026-11-05T13:00:00Z");
    const t = hourTicks(start, end);
    expect(t).toHaveLength(7);
    expect(t[0]).toBeCloseTo(1 / 8);
    expect(t[6]).toBeCloseTo(7 / 8);
  });
  it("début hors heure pleine, service vide ou inversé", () => {
    expect(hourTicks(new Date("2026-11-05T05:30:00Z"), new Date("2026-11-05T07:00:00Z"))).toEqual([
      1 / 3,
    ]);
    expect(hourTicks(new Date("2026-11-05T05:00:00Z"), new Date("2026-11-05T05:00:00Z"))).toEqual(
      [],
    );
    expect(hourTicks(new Date("2026-11-05T06:00:00Z"), new Date("2026-11-05T05:00:00Z"))).toEqual(
      [],
    );
  });
});
