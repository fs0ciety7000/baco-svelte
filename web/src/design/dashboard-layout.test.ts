import { describe, expect, it } from "vitest";

import { DEFAULT_LAYOUT, move, normalizeLayout } from "./dashboard-layout";

describe("disposition du tableau de bord", () => {
  it("retombe sur la disposition par défaut (format v1 ou invalide)", () => {
    expect(normalizeLayout([{ id: "gridstack", x: 0 }])).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
  });

  it("complète les widgets manquants et dédoublonne", () => {
    const l = normalizeLayout({ order: ["trains", "trains", "commandes"], hidden: ["travaux"] });
    expect(l.order.slice(0, 2)).toEqual(["trains", "commandes"]);
    expect(l.order).toHaveLength(DEFAULT_LAYOUT.order.length);
    expect(l.hidden).toEqual(["travaux"]);
  });

  it("ignore un widget retiré (« equipe ») sans perdre la disposition", () => {
    const l = normalizeLayout({ order: ["equipe", "trains"], hidden: ["equipe", "travaux"] });
    expect(l.order[0]).toBe("trains");
    expect(l.hidden).toEqual(["travaux"]);
  });

  it("déplace d'un cran, sans sortir des bornes", () => {
    expect(move(DEFAULT_LAYOUT, "impacts", -1).order.slice(0, 2)).toEqual([
      "impacts",
      "commandes",
    ]);
    expect(move(DEFAULT_LAYOUT, "commandes", -1)).toBe(DEFAULT_LAYOUT);
  });
});
