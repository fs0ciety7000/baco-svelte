import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("fusionne les classes et laisse la dernière gagner", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-fg", "text-danger")).toBe("text-danger");
    expect(cn("text-small", "text-body")).toBe("text-body");
  });

  it("garde une taille ET une couleur sémantiques (bug du bouton primaire)", () => {
    expect(cn("text-accent-fg", "text-body")).toBe("text-accent-fg text-body");
    expect(cn("text-small font-medium text-fg")).toBe("text-small font-medium text-fg");
    expect(cn("text-hint", "text-fg-muted")).toBe("text-hint text-fg-muted");
  });

  it("connaît les jetons v4 (surface-3, kpi, panel, ombres, hauteur de champ)", () => {
    expect(cn("text-kpi", "text-fg")).toBe("text-kpi text-fg");
    expect(cn("text-panel", "text-fg-muted")).toBe("text-panel text-fg-muted");
    expect(cn("bg-surface-2", "bg-surface-3")).toBe("bg-surface-3");
    expect(cn("shadow-rest", "shadow-float")).toBe("shadow-float");
    expect(cn("h-control", "h-field")).toBe("h-field");
  });
});
