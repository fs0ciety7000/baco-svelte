import { describe, expect, it } from "vitest";

import { aleaGroupBlocks, aleaGroupLine, aleaGroups, assistCopyText, numberFr } from "./model";

describe("libellé à copier", () => {
  it("nombre en toutes lettres (genré)", () => {
    expect(numberFr(1)).toBe("un");
    expect(numberFr(1, true)).toBe("une");
    expect(numberFr(3)).toBe("trois");
    expect(numberFr(21, true)).toBe("vingt et une");
    expect(numberFr(42)).toBe("quarante-deux");
  });
  it("chaise roulante / non-voyant, embarquement / débarquement", () => {
    expect(assistCopyText({ direction: "depart", pax: 1, pmrType: "CRE" })).toBe(
      "Embarquement d'une chaise roulante",
    );
    expect(assistCopyText({ direction: "arrivee", pax: 2, pmrType: "CRF" })).toBe(
      "Débarquement de deux chaises roulantes",
    );
    expect(assistCopyText({ direction: "depart", pax: 1, pmrType: "NV" })).toBe(
      "Embarquement d'un non-voyant",
    );
    expect(assistCopyText({ direction: "arrivee", pax: 3, pmrType: "NV" })).toBe(
      "Débarquement de trois non-voyants",
    );
    expect(assistCopyText({ direction: "depart", pax: 1, pmrType: "DCO" })).toBe(
      "Embarquement d'une personne avec des difficultés d'orientation",
    );
  });
});

describe("export ALEA", () => {
  it("additionne par train, gare, sens et type précis", () => {
    const base = { day: "2026-10-09", train: "3804", time: "08:00" };
    const groups = aleaGroups([
      { ...base, station: "MONS", io: "IN", pax: 1, pmrType: "NV" },
      { ...base, station: "MONS", io: "IN", pax: 2, pmrType: "NV" },
      { ...base, station: "MONS", io: "OUT", pax: 1, pmrType: "CRF" },
      { ...base, station: "LA LOUVIÈRE-SUD", time: "08:20", io: "OUT", pax: 3, pmrType: "NV" },
      { ...base, station: "LA LOUVIÈRE-SUD", time: "08:20", io: "IN", pax: 1, pmrType: "MR" },
    ]);
    expect(groups.map((g) => [g.station, g.lines])).toEqual([
      ["MONS", ["Embarquement de trois non-voyants", "Débarquement d'une chaise roulante fixe"]],
      [
        "LA LOUVIÈRE-SUD",
        ["Embarquement d'une mobilité réduite", "Débarquement de trois non-voyants"],
      ],
    ]);
  });
});

describe("export ALEA des groupes", () => {
  it("formule avec et sans enfants", () => {
    expect(aleaGroupLine("Embarquement", 53, 50)).toBe(
      "Embarquement d'un groupe de 53 personnes dont 50 enfants",
    );
    expect(aleaGroupLine("Débarquement", 22, 0)).toBe("Débarquement d'un groupe de 22 personnes");
    expect(aleaGroupLine("Embarquement", 2, 1)).toBe(
      "Embarquement d'un groupe de 2 personnes dont 1 enfant",
    );
  });
  it("une ligne par groupe, regroupées par train et gare", () => {
    const base = { day: "2026-10-09", train: "4879", time: "08:27" };
    const blocks = aleaGroupBlocks([
      { ...base, station: "MONS", io: "IN", total: 27, children: 22 },
      { ...base, station: "MONS", io: "IN", total: 25, children: 0 },
      { ...base, station: "CAMBRON-CASTEAU", time: "08:45", io: "OUT", total: 27, children: 22 },
    ]);
    expect(blocks.map((b) => [b.station, b.lines])).toEqual([
      [
        "MONS",
        [
          "Embarquement d'un groupe de 27 personnes dont 22 enfants",
          "Embarquement d'un groupe de 25 personnes",
        ],
      ],
      ["CAMBRON-CASTEAU", ["Débarquement d'un groupe de 27 personnes dont 22 enfants"]],
    ]);
  });
});
