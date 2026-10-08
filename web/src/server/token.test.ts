import { describe, expect, it } from "vitest";

import { isExpired, tokenPayload } from "./token";

const jwt = (payload: object) =>
  `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;

describe("token", () => {
  it("lit l'agent et l'expiration", () => {
    expect(tokenPayload(jwt({ id: "u1", exp: 100 }))).toEqual({ id: "u1", exp: 100 });
  });

  it("refuse un jeton illisible", () => {
    expect(tokenPayload("abc")).toBeNull();
    expect(tokenPayload("a.!!!.c")).toBeNull();
    expect(isExpired("abc")).toBe(true);
  });

  it("détecte l'expiration avec une marge", () => {
    const token = jwt({ id: "u1", exp: 1000 });
    expect(isExpired(token, 999_000)).toBe(false);
    expect(isExpired(token, 999_000, 5)).toBe(true);
  });
});
