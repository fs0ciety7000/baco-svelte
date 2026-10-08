import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("asChild rend l'enfant (lien) sans erreur de Slot", () => {
    render(
      <Button asChild>
        <a href="/commandes">Commandes</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Commandes" })).toHaveAttribute("href", "/commandes");
  });

  it("en chargement : occupé, désactivé, mais lisible (pas d'opacité réduite)", () => {
    render(<Button loading>Générer</Button>);
    const b = screen.getByRole("button", { name: "Générer" });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute("aria-busy", "true");
  });
});
