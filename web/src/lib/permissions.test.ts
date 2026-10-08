import { describe, expect, it } from "vitest";

import { MODULES } from "@/navigation";

import { PERMISSION_CATALOG } from "./permissions";

describe("catalogue des droits (Admin › Utilisateurs)", () => {
  it("couvre chaque droit testé par la navigation", () => {
    const keys = new Set(PERMISSION_CATALOG.flatMap((g) => g.items.map((i) => i.key)));
    const used = MODULES.flatMap((m) => m.tabs.map((t) => t.permission)).filter(
      (p): p is string => !!p,
    );
    expect(used.filter((p) => !keys.has(p))).toEqual([]);
  });
});
