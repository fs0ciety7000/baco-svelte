import { describe, expect, it } from "vitest";

import { BUS_STEPS, sectionState, stepStates, TAXI_STEPS } from "./steps";

describe("rail d'étapes des bons", () => {
  it("bus : complète, à compléter, facultative", () => {
    const steps = stepStates(BUS_STEPS, [{ field: "company" }, { field: "destination" }]);
    expect(steps.map((s) => [s.index, s.title, s.state])).toEqual([
      [1, "Incident", "complete"],
      [2, "Trajet", "todo"],
      [3, "Fournisseur", "todo"],
      [4, "Bus", "complete"],
      [5, "Options", "optional"],
    ]);
  });

  it("taxi standard sans manque : tout est complet sauf la facturation (facultative)", () => {
    expect(stepStates(TAXI_STEPS, []).map((s) => s.state)).toEqual([
      "complete",
      "complete",
      "complete",
      "optional",
    ]);
    expect(stepStates(TAXI_STEPS, [{ field: "return" }])[0]!.state).toBe("todo");
  });

  it("carte de section : rouge seulement après une tentative d'envoi", () => {
    const [done, todo, , , optional] = stepStates(BUS_STEPS, [{ field: "origin" }]);
    expect(sectionState(done, false)).toBe("complete");
    expect(sectionState(todo, false)).toBeUndefined();
    expect(sectionState(todo, true)).toBe("error");
    expect(sectionState(optional, true)).toBeUndefined();
    expect(sectionState(undefined, true)).toBeUndefined();
  });
});
