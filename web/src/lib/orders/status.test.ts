import { describe, expect, it } from "vitest";

import { isEditable, transitionsFor } from "./status";

describe("cycle des bons v3 (brouillon / en cours → terminé → envoyé / finalisé)", () => {
  it("brouillon : terminer (action principale) ou annuler", () => {
    const list = transitionsFor("brouillon", { coordinator: false });
    expect(list.map((t) => t.to)).toEqual(["termine", "annule"]);
    expect(list[0]).toMatchObject({ label: "Terminer (bus démobilisés)", primary: true });
  });

  it("terminé : valider l'envoi, revenir en cours ou annuler", () => {
    const list = transitionsFor("termine", { coordinator: false });
    expect(list.map((t) => t.to)).toEqual(["envoye", "brouillon", "annule"]);
    expect(list[0]?.label).toBe("Valider l'envoi");
  });

  it("envoyé / finalisé : seul un coordinateur rouvre ; plus modifiable", () => {
    expect(transitionsFor("envoye", { coordinator: false })).toEqual([]);
    expect(transitionsFor("envoye", { coordinator: true }).map((t) => t.label)).toEqual([
      "Rouvrir",
    ]);
    expect(isEditable("envoye")).toBe(false);
    expect(isEditable("termine")).toBe(true);
  });

  it("annulé : rétablir au statut précédent (coordinateur)", () => {
    const list = transitionsFor("annule", { coordinator: true, statusBeforeCancel: "termine" });
    expect(list).toEqual([{ to: "termine", label: "Rétablir", primary: true }]);
  });
});
