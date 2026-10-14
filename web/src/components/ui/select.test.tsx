import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { Field } from "./field";
import { renderInForm, setupPickerEnv, STATUTS } from "./picker-test-utils";
import { labelText, Select } from "./select";

beforeAll(setupPickerEnv);

describe("Select", () => {
  it("rôles APG, libellé de Field, valeur dans le champ caché", () => {
    const { form } = renderInForm(
      <Field label="Statut">
        <Select name="statut" options={STATUTS} defaultValue="termine" />
      </Field>,
    );
    const combo = screen.getByRole("combobox", { name: "Statut" });
    expect(combo).toHaveAttribute("aria-haspopup", "listbox");
    expect(combo).toHaveAttribute("aria-expanded", "false");
    expect(combo).toHaveTextContent("Terminé");
    expect(new FormData(form()).get("statut")).toBe("termine");
  });

  it("clavier : ↓ ouvre sur l'option choisie, ↓ ↓ saute la désactivée, Entrée choisit et émet change", () => {
    const { changes } = renderInForm(
      <Select name="statut" options={STATUTS} aria-label="Statut" />,
    );
    const combo = screen.getByRole("combobox");
    fireEvent.keyDown(combo, { key: "ArrowDown" });
    expect(combo).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("listbox");
    const active = () => document.getElementById(combo.getAttribute("aria-activedescendant")!);
    expect(active()).toHaveTextContent("Brouillon");
    fireEvent.keyDown(combo, { key: "End" });
    expect(active()).toHaveTextContent("Envoyé / finalisé");
    fireEvent.keyDown(combo, { key: "ArrowDown" });
    expect(active()).toHaveTextContent("Envoyé / finalisé");
    fireEvent.keyDown(combo, { key: "Home" });
    fireEvent.keyDown(combo, { key: "ArrowDown" });
    expect(within(list).getAllByRole("option")[1]).toHaveAttribute("data-active");
    fireEvent.keyDown(combo, { key: "Enter" });
    expect(combo).toHaveAttribute("aria-expanded", "false");
    expect(combo).toHaveTextContent("Terminé");
    expect(changes).toEqual([{ statut: "termine" }]);
  });

  it("frappe d'une lettre = saut ; Échap ferme sans changer", () => {
    const onValueChange = vi.fn();
    render(<Select options={STATUTS} aria-label="Statut" onValueChange={onValueChange} />);
    const combo = screen.getByRole("combobox");
    fireEvent.keyDown(combo, { key: "e" });
    expect(combo).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(combo.getAttribute("aria-activedescendant")!)).toHaveTextContent(
      "Envoyé",
    );
    fireEvent.keyDown(combo, { key: "Escape" });
    expect(combo).toHaveAttribute("aria-expanded", "false");
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("clearable : option vide « Tous » en tête ; clic sur une option", () => {
    const { changes } = renderInForm(
      <Select
        name="s"
        options={STATUTS}
        defaultValue="termine"
        clearable
        placeholder="Tous"
        aria-label="S"
      />,
    );
    fireEvent.click(screen.getByRole("combobox"));
    const opts = screen.getAllByRole("option");
    expect(opts[0]).toHaveTextContent("Tous");
    expect(opts[2]).toHaveAttribute("aria-selected", "true");
    fireEvent.click(opts[0]!);
    expect(changes).toEqual([{ s: "" }]);
  });

  it("aucun change au montage ni quand le parent change la valeur", () => {
    function Parent() {
      const [v, setV] = useState("brouillon");
      return (
        <>
          <button type="button" onClick={() => setV("termine")}>
            externe
          </button>
          <Select name="s" options={STATUTS} value={v} onValueChange={setV} aria-label="S" />
        </>
      );
    }
    const { changes } = renderInForm(<Parent />);
    fireEvent.click(screen.getByText("externe"));
    expect(screen.getByRole("combobox")).toHaveTextContent("Terminé");
    expect(changes).toEqual([]);
  });

  it("libellé englobant (filtres) : le titre de la liste ne reprend pas l'option choisie", () => {
    render(
      <label>
        <span>Action</span>
        <Select name="action" options={STATUTS} defaultValue="termine" />
      </label>,
    );
    expect(labelText(screen.getByRole("combobox"))).toBe("Action");
  });
});
