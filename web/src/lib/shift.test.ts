import { describe, expect, it } from "vitest";

import { clockLabel, durationLabel, isStale, shiftDayFor, shiftState, shiftWindow } from "./shift";

describe("service de l'agent", () => {
  it("fenêtres en heure de Bruxelles, nuit sur deux jours", () => {
    const am = shiftWindow("am", "2026-10-11");
    expect(am.start.toISOString()).toBe("2026-10-11T04:00:00.000Z"); // été : UTC+2
    expect(am.end.toISOString()).toBe("2026-10-11T12:00:00.000Z");
    const nuit = shiftWindow("nuit", "2026-12-01");
    expect(nuit.start.toISOString()).toBe("2026-12-01T21:00:00.000Z"); // hiver : UTC+1
    expect(nuit.end.toISOString()).toBe("2026-12-02T05:00:00.000Z");
  });

  it("nuit choisie à 3 h = nuit commencée la veille", () => {
    const at3 = new Date("2026-10-11T01:00:00Z"); // 3 h à Bruxelles
    expect(shiftDayFor("nuit", at3)).toBe("2026-10-10");
    expect(shiftDayFor("am", at3)).toBe("2026-10-11");
  });

  it("avant, en cours, terminé", () => {
    const choice = { kind: "extra" as const, day: "2026-10-11" }; // 8 h – 16 h
    expect(shiftState(choice, new Date("2026-10-11T05:00:00Z")).phase).toBe("avant");
    const mid = shiftState(choice, new Date("2026-10-11T10:00:00Z")); // 12 h
    expect(mid.phase).toBe("en-cours");
    if (mid.phase === "en-cours") {
      expect(mid.remaining).toBe(4 * 3600_000);
      expect(mid.progress).toBe(0.5);
    }
    expect(shiftState(choice, new Date("2026-10-11T14:30:00Z")).phase).toBe("termine");
    expect(isStale(choice, new Date("2026-10-11T15:00:00Z"))).toBe(false);
    expect(isStale(choice, new Date("2026-10-11T21:00:00Z"))).toBe(true);
  });

  it("libellés", () => {
    expect(durationLabel(3 * 3600_000 + 7 * 60_000 + 30_000)).toBe("3 h 07");
    expect(durationLabel(42 * 60_000 + 5_000)).toBe("42 min 05 s");
    expect(clockLabel(2 * 3600_000 + 41 * 60_000 + 5_000)).toBe("02:41:05");
  });
});
