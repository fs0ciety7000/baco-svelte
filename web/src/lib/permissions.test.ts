import { describe, expect, it } from "vitest";

import { can, canWriteB201, isAdmin } from "./permissions";

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

describe("canWriteB201", () => {
  it("agent rattaché à un district, pas sans district", () => {
    expect(canWriteB201({ role: "user", district: "Centre" })).toBe(true);
    expect(canWriteB201({ role: "user", district: "" })).toBe(false);
    expect(canWriteB201({ role: "moderator", district: "Sud-Est" })).toBe(true);
    expect(canWriteB201({ role: "moderator", district: "" })).toBe(true);
  });
  it("lecteur exclu ; otto_agent seulement avec district ; retrait explicite prioritaire ; admin toujours", () => {
    expect(canWriteB201({ role: "otto_agent", district: "Sud-Ouest" })).toBe(true);
    expect(canWriteB201({ role: "otto_agent", district: "" })).toBe(false);
    expect(canWriteB201({ role: "reader", district: "Sud-Ouest" })).toBe(false);
    expect(canWriteB201({ role: "user", district: "Sud-Ouest", denies: ["b201:write"] })).toBe(
      false,
    );
    expect(canWriteB201({ role: "admin" })).toBe(true);
  });
});
