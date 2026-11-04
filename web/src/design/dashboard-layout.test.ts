import { describe, expect, it } from "vitest";

import {
  DEFAULT_LAYOUT,
  isWide,
  move,
  normalizeLayout,
  reorder,
  setHidden,
  setWide,
  step,
} from "./dashboard-layout";

describe("disposition du tableau de bord", () => {
  it("retombe sur la disposition par défaut (format v1 ou invalide)", () => {
    expect(normalizeLayout([{ id: "gridstack", x: 0 }])).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
  });

  it("complète les widgets manquants et dédoublonne", () => {
    const l = normalizeLayout({ order: ["trains", "trains", "commandes"], hidden: ["travaux"] });
    expect(l.order.slice(0, 3)).toEqual(["service", "trains", "commandes"]);
    expect(l.order).toHaveLength(DEFAULT_LAYOUT.order.length);
    expect(l.hidden).toEqual(["travaux"]);
  });

  it("ignore un widget retiré (« equipe ») sans perdre la disposition", () => {
    const l = normalizeLayout({ order: ["equipe", "trains"], hidden: ["equipe", "travaux"] });
    expect(l.order.slice(0, 2)).toEqual(["service", "trains"]);
    expect(l.hidden).toEqual(["travaux"]);
  });

  it("déplace d'un cran, sans sortir des bornes", () => {
    expect(move(DEFAULT_LAYOUT, "impacts", -1).order.slice(1, 3)).toEqual(["impacts", "commandes"]);
    expect(move(DEFAULT_LAYOUT, "service", -1)).toBe(DEFAULT_LAYOUT);
  });
});

describe("personnalisation (4 nov. 2026)", () => {
  const visible = ["service", "impacts", "trains", "travaux"] as const;
  const base = normalizeLayout({
    order: ["service", "commandes", "impacts", "trains", "a-confirmer", "travaux"],
    hidden: [],
  });

  it("garde la taille par défaut sans choix enregistré, et lit un choix", () => {
    expect(isWide(base, "impacts")).toBe(true);
    expect(isWide(base, "trains")).toBe(false);
    const l = normalizeLayout({ order: [], hidden: [], wide: ["trains", "inconnu"] });
    expect(l.wide).toEqual(["trains"]);
    expect(isWide(l, "impacts")).toBe(false);
    // Taille illisible : défauts, sans perdre l'ordre.
    const odd = normalizeLayout({ order: ["trains"], hidden: [], wide: "x" });
    expect(odd.order[1]).toBe("trains");
    expect(isWide(odd, "impacts")).toBe(true);
  });

  it("bascule la taille et la visibilité", () => {
    expect(isWide(setWide(base, "trains", true), "trains")).toBe(true);
    expect(isWide(setWide(base, "impacts", false), "impacts")).toBe(false);
    expect(setWide(base, "impacts", true)).toBe(base);
    const h = setHidden(base, "trains", true);
    expect(h.hidden).toEqual(["trains"]);
    expect(setHidden(h, "trains", false).hidden).toEqual([]);
    expect(setHidden(h, "trains", true)).toBe(h);
  });

  it("réordonne parmi les widgets affichés sans déplacer les autres", () => {
    const l = reorder(base, visible, "travaux", "impacts");
    expect(l.order.slice(0, 6)).toEqual([
      "service",
      "commandes",
      "travaux",
      "impacts",
      "a-confirmer",
      "trains",
    ]);
    expect(reorder(base, visible, "trains", "trains")).toBe(base);
    expect(reorder(base, visible, "commandes", "trains")).toBe(base);
  });

  it("monte et descend d'un cran parmi les widgets affichés", () => {
    expect(step(base, visible, "trains", -1).order.slice(0, 4)).toEqual([
      "service",
      "commandes",
      "trains",
      "impacts",
    ]);
    expect(step(base, visible, "service", -1)).toBe(base);
    expect(step(base, visible, "travaux", 1)).toBe(base);
  });
});
