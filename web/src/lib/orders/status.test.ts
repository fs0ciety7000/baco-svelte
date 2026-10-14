import { describe, expect, it } from "vitest";

import { canDeleteOrder, isEditable, reopenPermission, transitionsFor } from "./status";

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

describe("suppression d'un bon (14 oct. 2026)", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");
  const order = (
    o: Partial<{ kind: "bus" | "taxi"; created_by: string; created: string; status: string }> = {},
  ) => ({
    kind: "bus" as const,
    created_by: "u1",
    created: "2026-10-14 08:00:00.000Z",
    status: "brouillon",
    ...o,
  });
  const has =
    (...perms: string[]) =>
    (p: string) =>
      perms.includes(p);

  it("droit de suppression du module : toujours, pour son type de bon", () => {
    expect(canDeleteOrder(has("otto:delete"), "x", order({ status: "envoye" }), now)).toBe(true);
    expect(canDeleteOrder(has("otto:delete"), "x", order({ kind: "taxi" }), now)).toBe(false);
    expect(canDeleteOrder(has("generate_taxi:delete"), "x", order({ kind: "taxi" }), now)).toBe(
      true,
    );
  });

  it("créateur avec le droit d'écriture, 8 h au plus, bon pas envoyé", () => {
    expect(canDeleteOrder(has("otto:write"), "u1", order(), now)).toBe(true);
    expect(canDeleteOrder(has("otto:write"), "u2", order(), now)).toBe(false);
    expect(canDeleteOrder(has(), "u1", order(), now)).toBe(false);
    expect(canDeleteOrder(has("otto:write"), "u1", order({ status: "envoye" }), now)).toBe(false);
    expect(
      canDeleteOrder(has("otto:write"), "u1", order({ created: "2026-10-14 03:59:00.000Z" }), now),
    ).toBe(false);
  });

  it("réouverture : une permission par type de bon", () => {
    expect(reopenPermission("bus")).toBe("bus:reopen");
    expect(reopenPermission("taxi")).toBe("taxi:reopen");
  });
});
