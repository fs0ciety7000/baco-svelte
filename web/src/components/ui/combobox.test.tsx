import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { StationInput } from "@/components/orders/station-input";

import { Combobox, comboboxMatch, filterOptions } from "./combobox";
import { Field } from "./field";
import { renderInForm, setupPickerEnv } from "./picker-test-utils";

beforeAll(setupPickerEnv);

const COMPANIES = [
  { value: "c1", label: "Autocars Dupont" },
  { value: "c2", label: "Éole Bus" },
  { value: "c3", label: "Voyages Léonard", hint: "Mons, Tournai" },
  { value: "c4", label: "Bus Dupuis", disabled: true },
];

const active = (input: HTMLElement) =>
  document.getElementById(input.getAttribute("aria-activedescendant") ?? "");

describe("filtre", () => {
  it("accents, casse et ponctuation ignorés ; chaque mot ; préfixe en tête", () => {
    expect(comboboxMatch({ value: "x", label: "Éole Bus" }, "eole")).toBe(true);
    expect(comboboxMatch({ value: "x", label: "Voyages Léonard", hint: "Mons" }, "leo mons")).toBe(
      true,
    );
    expect(comboboxMatch({ value: "x", label: "Éole Bus" }, "car")).toBe(false);
    expect(filterOptions(COMPANIES, "bus").map((o) => o.value)).toEqual(["c4", "c2"]);
  });
});

describe("Combobox (liste fermée)", () => {
  it("rôles APG, libellé de Field, valeur dans le champ caché", () => {
    const { form } = renderInForm(
      <Field label="Société">
        <Combobox name="societe" options={COMPANIES} defaultValue="c2" />
      </Field>,
    );
    const input = screen.getByRole("combobox", { name: "Société" });
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveValue("Éole Bus");
    expect(new FormData(form()).get("societe")).toBe("c2");
  });

  it("la frappe filtre, la première option est active, Entrée choisit et émet change", () => {
    const { changes, form } = renderInForm(
      <Combobox name="societe" options={COMPANIES} aria-label="Société" />,
    );
    const input = screen.getByRole("combobox");
    fireEvent.input(input, { target: { value: "leo" } });
    expect(input).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("listbox");
    expect(
      within(list)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Voyages LéonardMons, Tournai"]);
    expect(active(input)).toHaveTextContent("Voyages Léonard");
    expect(screen.getByText("1 résultat")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveValue("Voyages Léonard");
    expect(new FormData(form()).get("societe")).toBe("c3");
    expect(changes).toEqual([{ societe: "c3" }]);
  });

  it("↓ ↑ déplacent en sautant les options désactivées ; Alt+↓ ouvre sans filtre", () => {
    render(<Combobox options={COMPANIES} aria-label="Société" />);
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown", altKey: true });
    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(active(input)).toHaveTextContent("Autocars Dupont");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(active(input)).toHaveTextContent("Voyages Léonard");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(active(input)).toHaveTextContent("Voyages Léonard");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(active(input)).toHaveTextContent("Éole Bus");
  });

  it("Échap ferme puis vide ; sortie du champ : libellé exact retenu, sinon libellé choisi rendu", () => {
    const onValueChange = vi.fn();
    render(
      <Combobox
        options={COMPANIES}
        defaultValue="c1"
        onValueChange={onValueChange}
        aria-label="Société"
      />,
    );
    const input = screen.getByRole("combobox");
    fireEvent.input(input, { target: { value: "xyz" } });
    expect(screen.getByText("Aucun résultat")).toBeInTheDocument();
    fireEvent.blur(input);
    expect(input).toHaveValue("Autocars Dupont");
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.input(input, { target: { value: "eole bus" } });
    fireEvent.blur(input);
    expect(onValueChange).toHaveBeenLastCalledWith("c2");
    fireEvent.input(input, { target: { value: "ab" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("");
    fireEvent.blur(input);
    expect(onValueChange).toHaveBeenLastCalledWith("");
  });

  it("clic sur une option", () => {
    const { changes } = renderInForm(<Combobox name="s" options={COMPANIES} aria-label="S" />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: /Éole/ }));
    expect(changes).toEqual([{ s: "c2" }]);
  });

  it("chargement asynchrone : aria-busy puis options, réponses périmées ignorées", async () => {
    const loadOptions = vi.fn(async (q: string) => [{ value: q, label: `Résultat ${q}` }]);
    render(<Combobox loadOptions={loadOptions} aria-label="Async" />);
    const input = screen.getByRole("combobox");
    fireEvent.input(input, { target: { value: "ab" } });
    expect(await screen.findByRole("option", { name: "Résultat ab" })).toBeInTheDocument();
    expect(loadOptions).toHaveBeenCalledWith("ab");
  });

  it("aucun change au montage ni quand le parent change la valeur", () => {
    function Parent() {
      const [v, setV] = useState("c1");
      return (
        <>
          <button type="button" onClick={() => setV("c2")}>
            externe
          </button>
          <Combobox name="s" options={COMPANIES} value={v} onValueChange={setV} aria-label="S" />
        </>
      );
    }
    const { changes } = renderInForm(<Parent />);
    fireEvent.click(screen.getByText("externe"));
    expect(screen.getByRole("combobox")).toHaveValue("Éole Bus");
    expect(changes).toEqual([]);
  });
});

describe("Combobox (saisie libre)", () => {
  it("la valeur suit la frappe sans change ; change à la sortie ; option « Nouvelle… »", () => {
    const { changes } = renderInForm(
      <Combobox
        name="cat"
        allowFree
        options={[{ value: "Police", label: "Police" }]}
        createLabel={(q) => `Nouvelle catégorie « ${q} »`}
        aria-label="Catégorie"
      />,
    );
    const input = screen.getByRole("combobox");
    fireEvent.input(input, { target: { value: "Pompiers" } });
    expect(screen.getByRole("option", { name: "Nouvelle catégorie « Pompiers »" })).toBeVisible();
    expect(changes).toEqual([]);
    fireEvent.blur(input);
    expect(changes).toEqual([{ cat: "Pompiers" }]);
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(changes).toHaveLength(1);
    fireEvent.input(input, { target: { value: "pol" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("Police");
    expect(changes).toEqual([{ cat: "Pompiers" }, { cat: "Police" }]);
  });
});

describe("StationInput (socle Combobox)", () => {
  const refs = [
    { abbr: "FMS", names: ["Mons", "Bergen"] },
    { abbr: "FTY", names: ["Tournai", "Doornik"] },
    { names: ["Maubeuge (FR)", "Maubeuge"] },
    { names: ["Mons-Nord"] },
  ];
  function Harness({ initial = "" }: { initial?: string }) {
    const [v, setV] = useState(initial);
    return (
      <>
        <StationInput value={v} onChange={setV} refs={refs} aria-label="Origine" />
        <output data-testid="v">{v}</output>
      </>
    );
  }

  it("abréviation PtCar et nom NL proposent le nom FR ; Entrée choisit", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Origine" });
    fireEvent.focus(input);
    fireEvent.input(input, { target: { value: "FMS" } });
    expect(screen.getAllByRole("option")[0]).toHaveTextContent("Mons");
    fireEvent.input(input, { target: { value: "berg" } });
    expect(screen.getByRole("option", { name: "Mons" })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("v")).toHaveTextContent("Mons");
  });

  it("sortie du champ : nom corrigé vers celui du référentiel, saisie libre gardée sinon", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Origine" });
    fireEvent.input(input, { target: { value: "maubeuge" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("Maubeuge (FR)");
    fireEvent.input(input, { target: { value: "Gare inconnue" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("Gare inconnue");
  });

  it("la gare déjà saisie telle quelle n'est pas reproposée", () => {
    render(<Harness initial="Mons" />);
    const input = screen.getByRole("combobox", { name: "Origine" });
    fireEvent.focus(input);
    expect(screen.queryByRole("option", { name: "Mons" })).toBeNull();
    expect(screen.getByRole("option", { name: "Mons-Nord" })).toBeInTheDocument();
  });
});
