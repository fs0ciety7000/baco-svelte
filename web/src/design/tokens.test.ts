import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { contrast, deltaE } from "./contrast";
import {
  AUTO_THEMES,
  BADGE_TINT,
  choiceScheme,
  DIRECTIONS,
  MODULE_IDS,
  SHAPES,
  THEMES,
  themeById,
  themesCss,
  themeShadows,
  type ColorToken,
} from "./tokens";

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
const TEXTS: ColorToken[] = [
  "fg",
  "fg-muted",
  "accent",
  "ok",
  "warn",
  "danger",
  "info",
  "progress",
];
const STATUSES: ColorToken[] = ["ok", "warn", "danger", "info", "progress"];
/** Thèmes des directions v4 (Signal, Quai, Cabine) : tous les textes et statuts testés aussi sur `surface-3`. */
const V4_SURFACES: ColorToken[] = [...SURFACES, "surface-3"];

describe.each(THEMES)("thème $label", (theme) => {
  const c = theme.colors;
  // Texte courant : AAA (7:1) exigé pour le thème Contraste élevé, AA (4,5:1) ailleurs.
  const bodyMin = theme.id === "contraste" || theme.id === "net-contraste" ? 7 : 4.5;

  const surfaces = theme.direction ? V4_SURFACES : SURFACES;
  it.each(TEXTS.flatMap((t) => surfaces.map((s) => [t, s] as const)))(
    "%s lisible sur %s",
    (text, surface) => {
      const min = text === "fg" ? bodyMin : 4.5;
      expect(contrast(c[text], c[surface])).toBeGreaterThanOrEqual(min);
    },
  );

  // `surface-3` (v4 : survol, actif, surélevé), fixé ou dérivé : le texte reste lisible dessus dans tous les thèmes.
  it("surface-3 : texte (≥ 7:1), texte secondaire et accent (≥ 4,5:1)", () => {
    expect(contrast(c.fg, c["surface-3"])).toBeGreaterThanOrEqual(7);
    expect(contrast(c["fg-muted"], c["surface-3"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.accent, c["surface-3"])).toBeGreaterThanOrEqual(4.5);
  });

  it("surface-3 se distingue de surface-2", () => {
    expect(c["surface-3"]).not.toBe(c["surface-2"]);
  });

  it.each(surfaces)("texte d'appoint (fg-subtle) repérable sur %s (≥ 3:1)", (surface) => {
    expect(contrast(c["fg-subtle"], c[surface])).toBeGreaterThanOrEqual(3);
  });

  // Audit du 9 oct. 2026 : l'accent se confondait avec « warn » / « info » (« Confirmé » illisible).
  it.each(STATUSES)("accent distinct du statut %s (ΔE OKLab ≥ 0,1)", (status) => {
    expect(deltaE(c.accent, c[status])).toBeGreaterThanOrEqual(0.1);
  });

  it("statuts distincts entre eux (ΔE OKLab ≥ 0,1)", () => {
    for (const a of STATUSES)
      for (const b of STATUSES) if (a < b) expect(deltaE(c[a], c[b])).toBeGreaterThanOrEqual(0.1);
  });

  it("couleurs de module lisibles sur bg et surface", () => {
    for (const m of MODULE_IDS) {
      const color = theme.modules?.[m];
      if (!color) continue;
      for (const s of ["bg", "surface"] as const)
        expect(contrast(color, c[s])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("texte sur l'accent (boutons primaires)", () => {
    expect(contrast(c["accent-fg"], c.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SURFACES)("bordure des champs repérable sur %s (≥ 3:1)", (surface) => {
    expect(contrast(c["border-strong"], c[surface])).toBeGreaterThanOrEqual(3);
  });

  it.each(["accent", "ok", "warn", "danger", "info", "progress", "fg-muted"] as ColorToken[])(
    "badge %s lisible sur sa teinte",
    (token) => {
      const tint = theme.tint ?? BADGE_TINT;
      expect(contrast(c[token], mix(c.surface, c[token], tint))).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe("directions v4 (Signal, Quai, Cabine)", () => {
  it.each(DIRECTIONS)("$label : un thème Jour clair et un thème Nuit sombre", (d) => {
    expect(themeById(d.day).scheme).toBe("light");
    expect(themeById(d.night).scheme).toBe("dark");
    expect(themeById(d.day).direction).toBe(d.id);
    expect(themeById(d.night).direction).toBe(d.id);
  });

  it("Signal garde les identifiants jour / nuit et reste le défaut automatique", () => {
    expect(DIRECTIONS[0].id).toBe("signal");
    expect(AUTO_THEMES).toEqual({ dark: "nuit", light: "jour" });
    expect(themeById("jour").label).toBe("Signal · Jour");
    expect(themeById("nuit").label).toBe("Signal · Nuit");
  });

  it("un choix automatique ne fixe pas de schéma, un thème fixe oui", () => {
    for (const d of DIRECTIONS) expect(choiceScheme(d.auto)).toBeUndefined();
    expect(choiceScheme("quai-jour")).toBe("light");
    expect(choiceScheme("cabine-nuit")).toBe("dark");
  });

  it("chaque automatique a son bloc sombre et son bloc clair dans themes.css", () => {
    const css = themesCss();
    for (const d of DIRECTIONS) {
      expect(css).toContain(`\n[data-theme="${d.auto}"] {`);
      expect(css).toContain(`\n  [data-theme="${d.auto}"] {`);
    }
  });

  it("Signal : rayons 8 / 6 px, chiffres sans mono", () => {
    expect(SHAPES.net).toMatchObject({ box: "8px", control: "6px" });
    expect(themesCss()).toMatch(/\[data-theme="jour"\] \{[^}]*--figures-font: var\(--font-ui\);/);
  });
});

describe("ombres", () => {
  it("les thèmes « angle » n'ont aucune ombre (chanfreins d'origine)", () => {
    for (const t of THEMES.filter((x) => x.shape === "angle"))
      expect(themeShadows(t)).toEqual({ rest: "none", float: "none" });
  });

  it("les directions v4 ont une ombre flottante", () => {
    for (const t of THEMES.filter((x) => x.direction))
      expect(themeShadows(t).float).not.toBe("none");
  });

  it("les couleurs validées des « Autres thèmes » ne bougent pas", () => {
    // Témoins du catalogue du 9 oct. 2026 (seul `surface-3` y est dérivé).
    expect(themeById("commandement").colors.accent).toBe("#FAC13B");
    expect(themeById("rail").colors.bg).toBe("#0E1116");
    expect(themeById("ivoire").colors["surface-2"]).toBe("#EFE9DC");
  });
});

describe("themes.css", () => {
  it("est à jour (npm run tokens)", () => {
    const file = readFileSync(path.join(__dirname, "../app/themes.css"), "utf8");
    expect(file).toBe(themesCss());
  });
});
