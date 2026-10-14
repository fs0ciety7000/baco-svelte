import { describe, expect, it } from "vitest";

import seed from "@/data/station-seed.json";

import { stationSeed } from "./station-seed";

describe("référentiel des gares par défaut", () => {
  it("districts et types valides, clés repliées", () => {
    const entries = Object.entries(
      seed as Record<string, { d?: string; k?: string; l?: string[] }>,
    );
    expect(entries.length).toBeGreaterThan(500);
    for (const [key, e] of entries) {
      expect(key).toBe(key.toLowerCase());
      expect(["", "DSO", "DSE", "DCE", "DNO", "DNE"]).toContain(e.d ?? "");
      if (e.k) expect(["gare", "pang", "etranger"]).toContain(e.k);
    }
    expect(stationSeed("mons")?.d).toBe("DSO");
    expect(stationSeed("constructor")).toBeUndefined();
  });
});
