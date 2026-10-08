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
});
