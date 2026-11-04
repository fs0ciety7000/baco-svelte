import { describe, expect, it } from "vitest";

import {
  SEEN_MAX,
  impactSeenKey,
  impactState,
  pinSeenKey,
  readTodoSeen,
  splitSeen,
  updateTodoSeen,
} from "./todo-seen";

const NOW = Date.parse("2026-11-04T12:00:00Z");
const m = (delay: number, cancelled = false) => ({
  id: "abc123def456ghi",
  train: "IC 4562",
  impact: { delay, cancelled },
});

describe("todo-seen", () => {
  it("palier de l'état : une aggravation change la clé, un retard dans le même palier non", () => {
    expect(impactState({ delay: 6, cancelled: false })).toBe("r5");
    expect(impactState({ delay: 14, cancelled: false })).toBe("r5");
    expect(impactState({ delay: 15, cancelled: false })).toBe("r15");
    expect(impactState({ delay: 45, cancelled: false })).toBe("r30");
    expect(impactState({ delay: 90, cancelled: false })).toBe("r60");
    expect(impactState({ delay: 0, cancelled: true })).toBe("supprime");
    const day = "2026-11-04";
    expect(impactSeenKey(m(0, true), day)).toBe(
      "impact:abc123def456ghi:2026-11-04:IC4562:supprime",
    );
    expect(impactSeenKey(m(7), day)).toBe(impactSeenKey(m(12), day));
    expect(impactSeenKey(m(7), day)).not.toBe(impactSeenKey(m(16), day));
    expect(impactSeenKey(m(7), day)).not.toBe(impactSeenKey(m(7), "2026-11-05"));
    expect(pinSeenKey("p1")).toBe("pin:p1");
  });

  it("lit les préférences en écartant les clés invalides et périmées", () => {
    const prefs = {
      todoSeen: {
        "pin:a": "2026-11-04T08:00:00.000Z",
        "pin:old": "2026-11-01T08:00:00.000Z",
        "bus:x": "2026-11-04T08:00:00.000Z",
        "pin:bad": 12,
        "pin:nan": "pas une date",
      },
    };
    expect(readTodoSeen(prefs, NOW)).toEqual({ "pin:a": "2026-11-04T08:00:00.000Z" });
    expect(readTodoSeen(null, NOW)).toEqual({});
    expect(readTodoSeen({ todoSeen: ["pin:a"] }, NOW)).toEqual({});
  });

  it("marque, démarque, élague et borne", () => {
    const a = updateTodoSeen({ "pin:old": "2026-10-30T00:00:00.000Z" }, "pin:a", true, NOW);
    expect(a).toEqual({ "pin:a": new Date(NOW).toISOString() });
    expect(updateTodoSeen(a, "pin:a", false, NOW)).toEqual({});
    let big: Record<string, string> = {};
    for (let i = 0; i < SEEN_MAX + 5; i++)
      big[`pin:k${i}`] = new Date(NOW - (SEEN_MAX + 5 - i) * 1000).toISOString();
    big = updateTodoSeen(big, "pin:new", true, NOW);
    expect(Object.keys(big)).toHaveLength(SEEN_MAX);
    expect(big["pin:new"]).toBeDefined();
    expect(big["pin:k0"]).toBeUndefined();
  });

  it("sépare visibles et vus ; sans clé = toujours visible", () => {
    const items = [{ seenKey: "pin:a" }, { seenKey: "pin:b" }, {}];
    const r = splitSeen(items, { "pin:a": "x" });
    expect(r.hidden).toEqual([{ seenKey: "pin:a" }]);
    expect(r.visible).toHaveLength(2);
    expect(splitSeen(items, new Set(["pin:b"])).hidden).toEqual([{ seenKey: "pin:b" }]);
  });
});
