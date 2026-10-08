import { describe, expect, it } from "vitest";

import { can, isAdmin } from "./permissions";

describe("permissions", () => {
  it("applique le rôle par défaut", () => {
    expect(can({ role: "user" }, "otto:write")).toBe(true);
    expect(can({ role: "reader" }, "otto:write")).toBe(false);
    expect(can({ role: "otto_agent" }, "pmr:read")).toBe(false);
  });

  it("donne tout à l'admin et rien au compte désactivé", () => {
    expect(can({ role: "admin" }, "audit:read")).toBe(true);
    expect(can({ role: "disabled" }, "otto:read")).toBe(false);
    expect(isAdmin({ role: "sysop" })).toBe(true);
  });

  it("une permission accordée l'emporte, puis une permission retirée", () => {
    expect(can({ role: "reader", grants: ["otto:write"] }, "otto:write")).toBe(true);
    expect(can({ role: "user", denies: ["otto:write"] }, "otto:write")).toBe(false);
  });
});
