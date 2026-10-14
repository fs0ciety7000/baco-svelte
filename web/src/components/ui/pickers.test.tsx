import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { DateField, DateRangePicker } from "./date-field";
import { Field } from "./field";
import { FormAutoSubmit } from "./form-auto-submit";
import { MonthField } from "./month-field";
import { renderInForm, setupPickerEnv, STATUTS } from "./picker-test-utils";
import { Select } from "./select";
import { TimeField } from "./time-field";

beforeAll(setupPickerEnv);

describe("DateField", () => {
  it("affiche jj/mm/aaaa, valeur ISO dans le champ caché", () => {
    const { form } = renderInForm(
      <Field label="Jour">
        <DateField name="jour" defaultValue="2026-10-14" />
      </Field>,
    );
    expect(screen.getByLabelText("Jour")).toHaveValue("14/10/2026");
    expect(new FormData(form()).get("jour")).toBe("2026-10-14");
  });

  it("« 14102026 » est formaté et émis une seule fois (pas de change natif du champ visible)", () => {
    const { changes } = renderInForm(<DateField name="jour" aria-label="Jour" />);
    const input = screen.getByLabelText("Jour");
    fireEvent.input(input, { target: { value: "14102026" } });
    expect(input).toHaveValue("14/10/2026");
    fireEvent.change(input);
    fireEvent.blur(input);
    expect(changes).toEqual([{ jour: "2026-10-14" }]);
  });

  it("« 3/2 » est complété à la sortie du champ (année en cours) ; texte illisible : retour à la valeur", () => {
    const onValueChange = vi.fn();
    render(<DateField aria-label="Jour" defaultValue="2026-10-14" onValueChange={onValueChange} />);
    const input = screen.getByLabelText("Jour");
    fireEvent.input(input, { target: { value: "3/2" } });
    fireEvent.blur(input);
    expect(onValueChange).toHaveBeenLastCalledWith(expect.stringMatching(/^\d{4}-02-03$/));
    fireEvent.input(input, { target: { value: "99/99" } });
    fireEvent.blur(input);
    expect((input as HTMLInputElement).value).toMatch(/^03\/02\/\d{4}$/);
  });

  it("↑ ↓ changent le segment sous le curseur", () => {
    const onValueChange = vi.fn();
    render(<DateField aria-label="Jour" defaultValue="2026-10-31" onValueChange={onValueChange} />);
    const input = screen.getByLabelText("Jour") as HTMLInputElement;
    input.setSelectionRange(0, 0);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(onValueChange).toHaveBeenLastCalledWith("2026-11-01");
    input.setSelectionRange(4, 4);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(onValueChange).toHaveBeenLastCalledWith("2026-10-01");
    input.setSelectionRange(8, 8);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(onValueChange).toHaveBeenLastCalledWith("2027-10-01");
  });

  it("calendrier : grille, semaine du lundi, fériés belges, flèches et Entrée", () => {
    const onValueChange = vi.fn();
    render(<DateField aria-label="Jour" defaultValue="2026-11-10" onValueChange={onValueChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le calendrier" }));
    const grid = screen.getByRole("grid", { name: "Novembre 2026" });
    expect(within(grid).getAllByRole("columnheader")[0]).toHaveTextContent("lu");
    const armistice = within(grid).getByRole("button", {
      name: /11 novembre 2026, férié : Armistice/,
    });
    expect(armistice).toBeInTheDocument();
    const focused = document.activeElement as HTMLElement;
    expect(focused.dataset.date).toBe("2026-11-10");
    fireEvent.keyDown(focused, { key: "ArrowRight" });
    expect((document.activeElement as HTMLElement).dataset.date).toBe("2026-11-11");
    fireEvent.keyDown(document.activeElement!, { key: "PageDown" });
    expect((document.activeElement as HTMLElement).dataset.date).toBe("2026-12-11");
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect((document.activeElement as HTMLElement).dataset.date).toBe("2026-12-07");
    fireEvent.click(document.activeElement!);
    expect(onValueChange).toHaveBeenLastCalledWith("2026-12-07");
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("min / max : jours hors bornes désactivés, saisie ramenée dans les bornes", () => {
    const onValueChange = vi.fn();
    render(
      <DateField
        aria-label="Jour"
        defaultValue="2026-10-14"
        min="2026-10-10"
        max="2026-10-20"
        onValueChange={onValueChange}
      />,
    );
    const input = screen.getByLabelText("Jour");
    fireEvent.input(input, { target: { value: "01/10/2026" } });
    fireEvent.blur(input);
    expect(onValueChange).toHaveBeenLastCalledWith("2026-10-10");
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le calendrier" }));
    expect(screen.getByRole("button", { name: /21 octobre 2026/ })).toBeDisabled();
  });
});

describe("DateRangePicker", () => {
  it("raccourci : les deux bornes changent, un seul change ; « Au » ne précède jamais « Du »", () => {
    const { changes, form } = renderInForm(
      <DateRangePicker nameFrom="du" nameTo="au" defaultFrom="2026-10-01" defaultTo="2026-10-05" />,
    );
    const [du, au] = [screen.getByLabelText("Du"), screen.getByLabelText("Au")];
    fireEvent.input(du, { target: { value: "10/10/2026" } });
    expect(new FormData(form()).get("au")).toBe("2026-10-10");
    expect(changes.at(-1)).toEqual({ du: "2026-10-10", au: "2026-10-10" });
    expect(au).toHaveValue("10/10/2026");
    const before = changes.length;
    fireEvent.click(screen.getAllByRole("button", { name: "Ouvrir le calendrier" })[0]!);
    act(() => screen.getByRole("button", { name: "Semaine" }).click());
    expect(changes.length).toBe(before + 1);
    const fd = new FormData(form());
    expect(fd.get("du")! <= fd.get("au")!).toBe(true);
  });
});

describe("TimeField", () => {
  it("« 1450 » → 14:50, valeur dans le champ caché", () => {
    const { changes } = renderInForm(<TimeField name="heure" aria-label="Heure" />);
    const input = screen.getByLabelText("Heure");
    fireEvent.input(input, { target: { value: "1450" } });
    expect(input).toHaveValue("14:50");
    expect(changes).toEqual([{ heure: "14:50" }]);
  });

  it("« 945 » complété à la sortie ; ↑ ↓ : pas de 5 minutes, ± 1 h sur les heures", () => {
    const onValueChange = vi.fn();
    render(<TimeField aria-label="Heure" onValueChange={onValueChange} />);
    const input = screen.getByLabelText("Heure") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "945" } });
    fireEvent.blur(input);
    expect(onValueChange).toHaveBeenLastCalledWith("09:45");
    input.setSelectionRange(4, 4);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(onValueChange).toHaveBeenLastCalledWith("09:50");
    input.setSelectionRange(1, 1);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(onValueChange).toHaveBeenLastCalledWith("08:50");
  });

  it("pending : « À confirmer » tant que vide ; vider rend une valeur vide", () => {
    const onValueChange = vi.fn();
    render(
      <TimeField aria-label="Heure" pending defaultValue="06:40" onValueChange={onValueChange} />,
    );
    const input = screen.getByLabelText("Heure");
    fireEvent.input(input, { target: { value: "" } });
    expect(onValueChange).toHaveBeenLastCalledWith("");
    expect(input).toHaveAttribute("placeholder", "À confirmer");
    expect(input).toHaveAttribute("data-pending", "true");
  });

  it("bouton Maintenant", () => {
    const onValueChange = vi.fn();
    render(<TimeField aria-label="Heure" onValueChange={onValueChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Maintenant" }));
    expect(onValueChange).toHaveBeenLastCalledWith(expect.stringMatching(/^\d{2}:\d{2}$/));
  });
});

describe("MonthField", () => {
  it("mm/aaaa, valeur AAAA-MM, grille des mois", () => {
    const { form, changes } = renderInForm(
      <MonthField name="mois" aria-label="Mois" defaultValue="2026-10" />,
    );
    const input = screen.getByLabelText("Mois");
    expect(input).toHaveValue("10/2026");
    fireEvent.input(input, { target: { value: "032027" } });
    expect(new FormData(form()).get("mois")).toBe("2027-03");
    fireEvent.click(screen.getByRole("button", { name: "Choisir un mois" }));
    fireEvent.click(screen.getByRole("button", { name: /mai/i }));
    expect(changes.at(-1)).toEqual({ mois: "2027-05" });
  });
});

describe("pont formulaire + FormAutoSubmit", () => {
  it("un choix soumet le formulaire une fois ; la saisie partielle d'une date, jamais", () => {
    const submit = vi.fn();
    HTMLFormElement.prototype.requestSubmit = submit;
    render(
      <form>
        <FormAutoSubmit live />
        <Select name="statut" options={STATUTS} aria-label="Statut" />
        <DateField name="du" aria-label="Du" />
      </form>,
    );
    const du = screen.getByLabelText("Du");
    fireEvent.input(du, { target: { value: "14/1" } });
    fireEvent.change(du);
    expect(submit).not.toHaveBeenCalled();
    fireEvent.input(du, { target: { value: "14/10/2026" } });
    expect(submit).toHaveBeenCalledTimes(1);
    const combo = screen.getByRole("combobox");
    fireEvent.keyDown(combo, { key: "ArrowDown" });
    fireEvent.keyDown(combo, { key: "Enter" });
    expect(submit).toHaveBeenCalledTimes(2);
  });
});
