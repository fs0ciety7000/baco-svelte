import { describe, expect, it } from "vitest";

import {
  DEFAULT_LAYOUT,
  isWide,
  move,
  normalizeLayout,
  reorder,
  setHidden,
  setWide,
  resizeBy,
  setSize,
  sizeOf,
  spanOf,
  step,
} from "./dashboard-layout";

describe("disposition du tableau de bord", () => {
  it("retombe sur la disposition par défaut (format v1 ou invalide)", () => {
    expect(normalizeLayout([{ id: "gridstack", x: 0 }])).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
  });

  it("complète les widgets manquants et dédoublonne", () => {
    const l = normalizeLayout({ order: ["trains", "trains", "commandes"], hidden: ["travaux"] });
    // « Prochaines prises en charge » (5 nov. 2026) juste après « Fin de service ».
    expect(l.order.slice(0, 4)).toEqual(["service", "prochaines", "trains", "commandes"]);
    expect(l.order).toHaveLength(DEFAULT_LAYOUT.order.length);
    expect(l.hidden).toEqual(["travaux"]);
  });

  it("ignore un widget retiré (« equipe ») sans perdre la disposition", () => {
    const l = normalizeLayout({ order: ["equipe", "trains"], hidden: ["equipe", "travaux"] });
    expect(l.order.slice(0, 3)).toEqual(["service", "prochaines", "trains"]);
    expect(l.hidden).toEqual(["travaux"]);
  });

  it("déplace d'un cran, sans sortir des bornes", () => {
    expect(move(DEFAULT_LAYOUT, "prochaines", -1).order.slice(1, 3)).toEqual([
      "prochaines",
      "pmr-jour",
    ]);
    expect(move(DEFAULT_LAYOUT, "service", -1)).toBe(DEFAULT_LAYOUT);
  });
});

describe("personnalisation (4 nov. 2026)", () => {
  const visible = ["service", "impacts", "trains", "travaux"] as const;
  const base = normalizeLayout({
    order: ["service", "commandes", "impacts", "trains", "a-confirmer", "travaux", "prochaines"],
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
    expect(odd.order[2]).toBe("trains");
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

describe("taille libre (5 nov. 2026)", () => {
  it("ignore l'ancien « Large / Normal » et garde une taille choisie", () => {
    const old = normalizeLayout({ order: [], hidden: [], wide: ["trains"] });
    expect(sizeOf(old, "trains")).toEqual({ w: 3, h: 5 });
    const l = setSize(old, "mentions", { w: 6, h: 9 });
    expect(sizeOf(l, "mentions")).toEqual({ w: 6, h: 9 });
    expect(sizeOf(l, "trains")).toEqual({ w: 3, h: 5 });
    expect(normalizeLayout(l).sizes?.mentions).toEqual({ w: 6, h: 9 });
    expect(setSize(l, "mentions", { w: 6, h: 9 })).toBe(l);
  });

  it("borne les tailles et ignore une taille illisible", () => {
    expect(sizeOf(setSize(DEFAULT_LAYOUT, "trains", { w: 40, h: 0 }), "trains")).toEqual({
      w: 12,
      h: 2,
    });
    const l = normalizeLayout({ order: [], hidden: [], sizes: { trains: { w: 1 }, x: {} } });
    expect(l.sizes).toBeUndefined();
  });

  it("colonnes occupées sur 12 et sur 6", () => {
    expect(spanOf({ w: 4, h: 5 }, 12)).toBe(4);
    expect(spanOf({ w: 4, h: 5 }, 6)).toBe(2);
    expect(spanOf({ w: 3, h: 5 }, 6)).toBe(2);
    expect(spanOf({ w: 12, h: 5 }, 6)).toBe(6);
  });

  it("aimante le glisser de la poignée aux cases de la grille", () => {
    const grid = { cols: 12 as const, colPx: 100, rowPx: 56 };
    expect(resizeBy({ w: 4, h: 5 }, 140, 30, grid)).toEqual({ w: 5, h: 6 });
    expect(resizeBy({ w: 4, h: 5 }, 40, -20, grid)).toEqual({ w: 4, h: 5 });
    expect(resizeBy({ w: 4, h: 5 }, -900, -900, grid)).toEqual({ w: 3, h: 2 });
    // Grille de 6 : une colonne = 2 sur 12 ; largeur fine gardée tant que la colonne ne change pas.
    const md = { cols: 6 as const, colPx: 120, rowPx: 56 };
    expect(resizeBy({ w: 5, h: 5 }, 30, 0, md)).toEqual({ w: 5, h: 5 });
    expect(resizeBy({ w: 4, h: 5 }, 130, 0, md)).toEqual({ w: 6, h: 5 });
  });
});
