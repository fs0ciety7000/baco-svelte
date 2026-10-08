import { describe, expect, it } from "vitest";

import { assistCopyText, numberFr } from "./model";

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
