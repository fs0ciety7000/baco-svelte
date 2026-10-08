import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("concatène les classes et ignore les valeurs falsy", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });

  it("résout les conflits Tailwind (la dernière classe gagne)", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
});
