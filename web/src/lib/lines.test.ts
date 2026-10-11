import { describe, expect, it } from "vitest";

import { lineLabel } from "./lines";

describe("lineLabel", () => {
  it("ajoute le préfixe une seule fois", () => {
    expect(lineLabel("132")).toBe("L.132");
    expect(lineLabel("L.132")).toBe("L.132");
    expect(lineLabel("L 96")).toBe("L.96");
    expect(lineLabel("l.25A")).toBe("L.25A");
    expect(lineLabel(96)).toBe("L.96");
    expect(lineLabel("")).toBe("");
  });
});
