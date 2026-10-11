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

describe("rôles v2", () => {
  it("PACO/RCCA : lecture, écriture, modification, jamais de suppression", async () => {
    const { can } = await import("./permissions");
    const paco = { role: "paco" as const };
    expect(can(paco, "otto:read")).toBe(true);
    expect(can(paco, "otto:write")).toBe(true);
    expect(can(paco, "otto:update")).toBe(true);
    expect(can(paco, "otto:delete")).toBe(false);
    expect(can({ ...paco, grants: ["otto:delete"] }, "otto:delete")).toBe(true);
    expect(can({ ...paco, denies: ["otto:update"] }, "otto:update")).toBe(false);
  });

  it("modérateur : suppression comprise ; invité : lecture bus et taxis seulement", async () => {
    const { can, canEditChangelog, isAdmin } = await import("./permissions");
    expect(can({ role: "moderator" }, "documents:delete")).toBe(true);
    expect(can({ role: "moderator", denies: ["documents:delete"] }, "documents:delete")).toBe(
      false,
    );
    expect(canEditChangelog({ role: "moderator" })).toBe(true);
    expect(isAdmin({ role: "moderator" })).toBe(false);
    expect(can({ role: "guest" }, "otto:read")).toBe(true);
    expect(can({ role: "guest" }, "generate_taxi:read")).toBe(true);
    expect(can({ role: "guest" }, "otto:write")).toBe(false);
    expect(can({ role: "guest" }, "journal:read")).toBe(false);
  });
});
