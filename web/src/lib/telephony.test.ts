import { describe, expect, it } from "vitest";

import { e164 } from "./telephony";

describe("téléphonie", () => {
  it("met les numéros belges au format international", () => {
    expect(e164("0478 12 34 56")).toBe("+32478123456");
    expect(e164("065/12.34.56")).toBe("+3265123456");
    expect(e164("0033 1 23 45 67 89")).toBe("+33123456789");
    expect(e164("+32 2 528 28 28")).toBe("+3225282828");
    expect(e164("4455")).toBe("4455");
  });
});
