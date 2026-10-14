import { describe, expect, it } from "vitest";

import { hiddenCategories, hiddenFilter } from "./notification-prefs";

describe("préférences de notifications", () => {
  it("lit les catégories masquées, ignore le reste", () => {
    expect(hiddenCategories(null)).toEqual([]);
    expect(hiddenCategories({ notifications: { hidden: ["train", "x", 3, "train"] } })).toEqual([
      "train",
    ]);
  });
  it("construit le filtre d'exclusion", () => {
    expect(hiddenFilter([])).toBe("");
    expect(hiddenFilter(["train", "dicos"])).toBe('kind != "train" && kind != "dicos"');
    expect(hiddenFilter(["travaux"])).toBe('(kind != "perturbation" || title !~ "Travaux (")');
    expect(hiddenFilter(["perturbation"])).toBe('(kind != "perturbation" || title ~ "Travaux (")');
    expect(hiddenFilter(["perturbation", "travaux"])).toBe('kind != "perturbation"');
  });
});
