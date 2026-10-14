import { describe, expect, it } from "vitest";

import { companyLineChoices, diffCompanyLines, railLineOption } from "./company-lines";

const REF = [
  railLineOption({ line: "96", name: "Bruxelles-Midi – Quévy" }),
  railLineOption({ line: "118", name: "La Louvière-Sud – Mons" }),
  railLineOption({ line: "L.97", name: "" }),
];

describe("lignes desservies d'une société de bus", () => {
  it("option du référentiel : « L.96 — extrémités »", () => {
    expect(REF[0]).toEqual({ value: "L.96", label: "L.96 — Bruxelles-Midi – Quévy" });
    expect(REF[2]).toEqual({ value: "L.97", label: "L.97" });
  });

  it("anciennes valeurs : reconnues par numéro, sinon gardées « hors référentiel »", () => {
    const c = companyLineChoices(REF, [
      { id: "a", line: "96" },
      { id: "b", line: "L 118" },
      { id: "c", line: "Navette Mons" },
      { id: "d", line: "L.96" },
    ]);
    expect(c.selected).toEqual(["L.96", "L.118", "Navette Mons"]);
    expect(c.options.map((o) => o.value)).toEqual(["L.96", "L.97", "L.118", "Navette Mons"]);
    expect(c.options.at(-1)?.hint).toBe("hors référentiel");
  });

  it("écart : ajouts canoniques, retraits par fiche (doublons compris)", () => {
    const stored = [
      { id: "a", line: "96" },
      { id: "b", line: "L.118" },
      { id: "c", line: "L.96" },
      { id: "d", line: "Navette Mons" },
    ];
    expect(diffCompanyLines(stored, ["L.96", "L.97", "Navette Mons"])).toEqual({
      add: ["L.97"],
      remove: ["b"],
    });
    expect(diffCompanyLines(stored, [])).toEqual({ add: [], remove: ["a", "b", "c", "d"] });
    expect(diffCompanyLines([], ["L.97", "97"])).toEqual({ add: ["L.97"], remove: [] });
  });
});
