import { describe, expect, it } from "vitest";

import { MODULES } from "@/navigation";

import { CATALOG_KEYS } from "./permissions/catalog";

describe("catalogue des droits (Admin › Utilisateurs)", () => {
  it("couvre chaque droit testé par la navigation (catalogue v3)", () => {
    const keys = new Set(CATALOG_KEYS);
    const used = MODULES.flatMap((m) => m.tabs.flatMap((t) => [t.permission ?? []].flat()));
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
    const { can, isAdmin } = await import("./permissions");
    expect(can({ role: "moderator" }, "documents:delete")).toBe(true);
    expect(can({ role: "moderator", denies: ["documents:delete"] }, "documents:delete")).toBe(
      false,
    );
    expect(can({ role: "moderator" }, "changelog:write")).toBe(true);
    expect(isAdmin({ role: "moderator" })).toBe(false);
    expect(can({ role: "guest" }, "otto:read")).toBe(true);
    expect(can({ role: "guest" }, "generate_taxi:read")).toBe(true);
    expect(can({ role: "guest" }, "otto:write")).toBe(false);
    expect(can({ role: "guest" }, "journal:read")).toBe(false);
  });
});
