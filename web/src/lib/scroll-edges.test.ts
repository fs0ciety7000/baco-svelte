import { describe, expect, it } from "vitest";

import { scrollEdges } from "./scroll-edges";

describe("ombres de bord d'un tableau qui défile", () => {
  it("rien à faire défiler : aucune ombre", () => {
    expect(scrollEdges(0, 800, 800)).toEqual({ left: false, right: false });
    expect(scrollEdges(0, 801, 800)).toEqual({ left: false, right: false });
  });
  it("au début, au milieu, à la fin", () => {
    expect(scrollEdges(0, 1200, 800)).toEqual({ left: false, right: true });
    expect(scrollEdges(200, 1200, 800)).toEqual({ left: true, right: true });
    expect(scrollEdges(399.5, 1200, 800)).toEqual({ left: true, right: false });
  });
  it("valeurs hors bornes (défilement élastique, sens RTL) bornées", () => {
    expect(scrollEdges(-50, 1200, 800)).toEqual({ left: true, right: true });
    expect(scrollEdges(900, 1200, 800)).toEqual({ left: true, right: false });
  });
});
