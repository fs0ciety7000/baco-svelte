import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { contrast } from "./contrast";
import { BADGE_TINT, THEMES, themesCss, type ColorToken } from "./tokens";

function mix(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(ch(a, i) * (1 - t) + ch(b, i) * t)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

const SURFACES: ColorToken[] = ["bg", "surface", "surface-2"];
const TEXTS: ColorToken[] = ["fg", "fg-muted", "accent", "ok", "warn", "danger", "info"];

describe.each(THEMES)("thème $label", (theme) => {
  const c = theme.colors;
  // Texte courant : AAA (7:1) exigé pour le thème Contraste élevé, AA (4,5:1) ailleurs.
  const bodyMin = theme.id === "contraste" ? 7 : 4.5;

  it.each(TEXTS.flatMap((t) => SURFACES.map((s) => [t, s] as const)))(
    "%s lisible sur %s",
    (text, surface) => {
      const min = text === "fg" ? bodyMin : 4.5;
      expect(contrast(c[text], c[surface])).toBeGreaterThanOrEqual(min);
    },
  );

  it("texte sur l'accent (boutons primaires)", () => {
    expect(contrast(c["accent-fg"], c.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SURFACES)("bordure des champs repérable sur %s (≥ 3:1)", (surface) => {
    expect(contrast(c["border-strong"], c[surface])).toBeGreaterThanOrEqual(3);
  });

  it.each(["accent", "ok", "warn", "danger", "info", "fg-muted"] as ColorToken[])(
    "badge %s lisible sur sa teinte",
    (token) => {
      expect(contrast(c[token], mix(c.surface, c[token], BADGE_TINT))).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe("themes.css", () => {
  it("est à jour (npm run tokens)", () => {
    const file = readFileSync(path.join(__dirname, "../app/themes.css"), "utf8");
    expect(file).toBe(themesCss());
  });
});
