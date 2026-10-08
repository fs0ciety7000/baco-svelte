import { describe, expect, it } from "vitest";

import { DEFAULT_LAYOUT, move, normalizeLayout } from "./dashboard-layout";

describe("disposition du tableau de bord", () => {
  it("retombe sur la disposition par défaut (format v1 ou invalide)", () => {
    expect(normalizeLayout([{ id: "gridstack", x: 0 }])).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
  });

  it("complète les widgets manquants et dédoublonne", () => {
    const l = normalizeLayout({ order: ["trains", "trains", "commandes"], hidden: ["equipe"] });
    expect(l.order.slice(0, 2)).toEqual(["trains", "commandes"]);
    expect(l.order).toHaveLength(DEFAULT_LAYOUT.order.length);
    expect(l.hidden).toEqual(["equipe"]);
  });

  it("déplace d'un cran, sans sortir des bornes", () => {
    expect(move(DEFAULT_LAYOUT, "a-confirmer", -1).order.slice(0, 2)).toEqual([
      "a-confirmer",
      "commandes",
    ]);
    expect(move(DEFAULT_LAYOUT, "commandes", -1)).toBe(DEFAULT_LAYOUT);
  });
});
