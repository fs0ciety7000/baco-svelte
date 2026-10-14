import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { CheckboxGroup } from "./checkbox-group";
import { DistrictPicker } from "./district-picker";
import { DISTRICT_NAME_OPTIONS } from "@/lib/district-param";
import { MultiSelect, multiSummary } from "./multi-select";
import { setupPickerEnv, STATUTS } from "./picker-test-utils";

beforeAll(setupPickerEnv);

/** Formulaire GET qui relève chaque `change` avec les valeurs répétées (`getAll`). */
function renderMulti(ui: React.ReactNode, key: string) {
  const changes: string[][] = [];
  let form: HTMLFormElement | null = null;
  render(
    <form
      ref={(f) => {
        form = f;
        f?.addEventListener("change", () => changes.push(new FormData(f).getAll(key) as string[]));
      }}
    >
      {ui}
    </form>,
  );
  return { changes, values: () => new FormData(form!).getAll(key) as string[] };
}

describe("multiSummary", () => {
  const o = (l: string) => ({ value: l, label: l });
  it("Tous, libellés, ou « N statuts »", () => {
    expect(multiSummary([], 3, { noun: "statut" })).toBe("Tous");
    expect(multiSummary([o("A"), o("B")], 3, { noun: "statut" })).toBe("A, B");
    expect(multiSummary([o("A"), o("B"), o("C")], 4, { noun: "statut" })).toBe("3 statuts");
    expect(multiSummary([o("A"), o("B"), o("C")], 3, { noun: "statut" })).toBe("Tous");
  });
});

describe("MultiSelect", () => {
  it("cases, aria-multiselectable, un seul change à la fermeture, paramètres répétés", () => {
    const { changes, values } = renderMulti(
      <MultiSelect name="statut" options={STATUTS} noun="statut" aria-label="Statut" />,
      "statut",
    );
    const trigger = screen.getByRole("combobox", { name: "Statut" });
    expect(trigger).toHaveTextContent("Tous");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const list = screen.getByRole("listbox");
    expect(list).toHaveAttribute("aria-multiselectable", "true");
    fireEvent.keyDown(trigger, { key: " " });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: " " });
    expect(values()).toEqual(["brouillon", "termine"]);
    expect(changes).toEqual([]);
    expect(screen.getByRole("option", { name: "Brouillon" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveTextContent("Brouillon, Terminé");
    expect(changes).toEqual([["brouillon", "termine"]]);
  });

  it("Tout / Aucun ; option désactivée ignorée ; valeur vide envoyée sans choix", () => {
    const { values } = renderMulti(
      <MultiSelect
        name="s"
        options={STATUTS}
        defaultValues={["termine"]}
        emptyValue="tous"
        aria-label="S"
      />,
      "s",
    );
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("button", { name: "Tout" }));
    expect(values()).toEqual(["brouillon", "termine", "envoye"]);
    fireEvent.click(screen.getByRole("option", { name: "Annulé" }));
    expect(values()).toEqual(["brouillon", "termine", "envoye"]);
    fireEvent.click(screen.getByRole("button", { name: "Aucun" }));
    expect(values()).toEqual(["tous"]);
  });

  it("recherche dans la liste (searchable)", () => {
    render(<MultiSelect options={STATUTS} searchable aria-label="S" />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.input(screen.getByRole("searchbox"), { target: { value: "envo" } });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Envoyé / finalisé"]);
  });
});

describe("DistrictPicker", () => {
  it("groupe de puces aria-pressed, « Tous », champs cachés répétés, change à chaque bascule", () => {
    const { changes, values } = renderMulti(
      <DistrictPicker name="district" defaultValues={["DSO"]} emptyValue="tous" />,
      "district",
    );
    expect(screen.getByRole("group", { name: "District" })).toBeInTheDocument();
    const dso = screen.getByRole("button", { name: /DSO/ });
    const dse = screen.getByRole("button", { name: /DSE/ });
    const all = screen.getByRole("button", { name: "Tous" });
    expect(dso).toHaveAttribute("aria-pressed", "true");
    expect(all).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(dse);
    expect(values()).toEqual(["DSO", "DSE"]);
    fireEvent.click(all);
    expect(values()).toEqual(["tous"]);
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(changes).toEqual([["DSO", "DSE"], ["tous"]]);
    fireEvent.click(all);
    expect(changes).toHaveLength(2);
  });

  it("« Mes districts » et valeurs en noms (contrôlé, sans « Tous »)", () => {
    const onValuesChange = vi.fn();
    render(
      <DistrictPicker
        options={DISTRICT_NAME_OPTIONS}
        values={["Centre"]}
        onValuesChange={onValuesChange}
        allLabel={null}
        mine={["Sud-Ouest", "Sud-Est"]}
      />,
    );
    expect(screen.queryByRole("button", { name: "Tous" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mes districts" }));
    expect(onValuesChange).toHaveBeenLastCalledWith(["Sud-Ouest", "Sud-Est"]);
    fireEvent.click(screen.getByRole("button", { name: /DSO/ }));
    expect(onValuesChange).toHaveBeenLastCalledWith(["Sud-Ouest", "Centre"]);
  });
});

describe("CheckboxGroup", () => {
  it("fieldset + legend, cases Radix, « Tout cocher », paramètres répétés", () => {
    const { changes, values } = renderMulti(
      <CheckboxGroup legend="Statut" name="statut" options={STATUTS} checkAll />,
      "statut",
    );
    expect(screen.getByRole("group", { name: "Statut" }).tagName).toBe("FIELDSET");
    fireEvent.click(screen.getByRole("checkbox", { name: "Terminé" }));
    expect(values()).toEqual(["termine"]);
    fireEvent.click(screen.getByRole("button", { name: "Tout cocher" }));
    expect(values()).toEqual(["brouillon", "termine", "envoye"]);
    expect(screen.getByRole("checkbox", { name: "Annulé" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Tout décocher" }));
    expect(values()).toEqual([]);
    expect(changes).toEqual([["termine"], ["brouillon", "termine", "envoye"], []]);
  });
});
