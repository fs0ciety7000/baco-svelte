import { describe, expect, it } from "vitest";

import { roleDefaults } from "./permissions/catalog";
import {
  addAdjustment,
  adjustmentHasEffect,
  adjustmentSignature,
  adjustmentsOf,
  dependentsOf,
  diffLabel,
  diffPerms,
  effectivePerms,
  historySentences,
  impactSentence,
  preview,
  requirementsOf,
  revertPatch,
  roleKeyFromLabel,
  searchEntries,
  sensitiveIn,
  setTask,
  splitAdjustments,
  TASK_GROUPS,
  taskSummary,
  toggle,
  VISIBLE,
} from "./roles-editor";

const paco = roleDefaults("paco");
const task = (id: string) => TASK_GROUPS.find((t) => t.id === id)!;

describe("catalogue visible", () => {
  it("cache les lectures BACO et garde une tâche par section", () => {
    expect(VISIBLE.some((e) => e.key === "planning:read")).toBe(false);
    expect(TASK_GROUPS.some((t) => t.id === "baco")).toBe(false);
    expect(task("commandes.bus").entries.map((e) => e.key)).toContain("bus:reopen");
  });
});

describe("dépendances", () => {
  it("chaîne complète des dépendances et des dépendants", () => {
    expect(requirementsOf("bus:reopen")).toEqual(["otto:read", "otto:update"]);
    expect(dependentsOf("otto:read")).toEqual(
      expect.arrayContaining(["otto:write", "otto:update", "otto:delete", "bus:reopen"]),
    );
    expect(dependentsOf("stats:read")).toEqual([]);
  });

  it("activer ajoute les dépendances, couper retire les dépendants", () => {
    const on = toggle([], "bus:reopen", true);
    expect(on.next).toEqual(["otto:read", "otto:update", "bus:reopen"]);
    expect(on.alsoOn).toEqual(["otto:read", "otto:update"]);
    const off = toggle(paco, "otto:read", false);
    expect(off.next).not.toContain("otto:update");
    expect(off.next).not.toContain("bus:reopen");
    expect(off.alsoOff).toEqual(["otto:write", "otto:update", "bus:reopen"]);
  });

  it("garde les clés cachées déjà présentes", () => {
    expect(toggle(paco, "stats:read", false).next).toContain("planning:read");
  });

  it("bascule de toute une tâche", () => {
    const none = setTask(paco, "commandes.bus", false);
    expect(none.next.some((k) => k.startsWith("otto:") || k === "bus:reopen")).toBe(false);
    const all = setTask([], "commandes.bus", true);
    expect(taskSummary(task("commandes.bus"), all.next).kind).toBe("all");
    expect(all.alsoOn).toEqual([]);
  });
});

describe("résumés et aperçu", () => {
  it("Tout / Voir seulement / Aucun / Personnalisé", () => {
    const bus = task("commandes.bus");
    expect(taskSummary(bus, roleDefaults("moderator")).label).toBe("Tout");
    expect(taskSummary(bus, roleDefaults("guest")).label).toBe("Voir seulement");
    expect(taskSummary(bus, []).label).toBe("Aucun");
    expect(taskSummary(bus, paco)).toMatchObject({ kind: "custom", label: "4 sur 5" });
  });

  it("différences, phrases et droits sensibles", () => {
    const d = diffPerms(paco, [...paco.filter((k) => k !== "stats:read"), "otto:delete"]);
    expect(d).toEqual({ added: ["otto:delete"], removed: ["stats:read"] });
    expect(diffLabel(d)).toBe("+1, −1");
    expect(sensitiveIn(d.added)).toEqual(["otto:delete"]);
    expect(impactSentence(d, 4)).toBe(
      "4 agents vont recevoir : Supprimer un bon bus ; et perdre : Voir les statistiques.",
    );
    expect(impactSentence(d, 0)).toMatch(/Aucun agent/);
    const p = preview(roleDefaults("guest"));
    expect(p.can.map((e) => e.key)).toEqual(["otto:read", "generate_taxi:read"]);
    expect(p.can.length + p.cannot.length).toBe(VISIBLE.length);
  });

  it("recherche sans accents, sur tous les mots", () => {
    const keys = searchEntries("supprimer bus").map((e) => e.key);
    expect(keys).toContain("otto:delete");
    expect(keys).not.toContain("generate_taxi:delete");
    expect(searchEntries("modérer").map((e) => e.key)).toContain("journal:moderate");
    expect(searchEntries("").length).toBe(VISIBLE.length);
  });
});

describe("création", () => {
  it("identifiant tiré du nom, unique", () => {
    expect(roleKeyFromLabel("Coordinateur de nuit", [])).toBe("coordinateur-de-nuit");
    expect(roleKeyFromLabel("Coordinateur de nuit", ["coordinateur-de-nuit"])).toBe(
      "coordinateur-de-nuit-2",
    );
    expect(roleKeyFromLabel("Équipe été", [])).toBe("equipe-ete");
    expect(roleKeyFromLabel("123", [])).toBe("role-123");
    expect(roleKeyFromLabel("!!", [])).toMatch(/^role/);
    expect(roleKeyFromLabel("x".repeat(80), []).length).toBeLessThanOrEqual(40);
  });
});

describe("historique", () => {
  it("phrases et retour arrière d'une modification", () => {
    const changes = {
      label: { old: "Nuit", new: "Coordinateur de nuit" },
      perms: { old: ["otto:read"], new: ["otto:read", "stats:read"] },
      updated_by: { old: "", new: "abc" },
    };
    expect(historySentences("update", changes)).toEqual([
      "a renommé le rôle « Nuit » en « Coordinateur de nuit »",
      "a ajouté « Voir les statistiques »",
    ]);
    expect(revertPatch("update", changes)).toEqual({ label: "Nuit", perms: ["otto:read"] });
    expect(revertPatch("update", { updated_by: { old: "", new: "x" } })).toBeNull();
    expect(revertPatch("create", changes)).toBeNull();
    expect(historySentences("create", {})).toEqual(["a créé le rôle"]);
  });
});

describe("ajustements d'un agent", () => {
  it("lecture, écriture, effet", () => {
    const adj = adjustmentsOf(
      ["repertoire:update", "planning:read"],
      ["pmr:read", "repertoire:update"],
    );
    expect(adj).toEqual({ "repertoire:update": "plus", "pmr:read": "moins" });
    expect(splitAdjustments(adj)).toEqual({ grants: ["repertoire:update"], denies: ["pmr:read"] });
    const eff = effectivePerms("paco", paco, adj);
    expect(eff).not.toContain("pmr:read");
    expect(eff).not.toContain("pmr:update");
    expect(adjustmentHasEffect(paco, "repertoire:update", "plus")).toBe(false);
    expect(adjustmentHasEffect(paco, "pmr:read", "moins")).toBe(true);
  });

  it("« en plus » ajoute les dépendances absentes du rôle", () => {
    const guest = roleDefaults("guest");
    const r = addAdjustment({}, guest, "bus:reopen", "plus");
    expect(r.alsoPlus).toEqual(["otto:update"]);
    expect(effectivePerms("guest", guest, r.next)).toContain("bus:reopen");
    const back = addAdjustment({ "otto:read": "moins" }, guest, "otto:update", "plus");
    expect(back.next["otto:read"]).toBe("plus");
  });

  it("empreinte des ajustements", () => {
    expect(adjustmentSignature("paco", [], [])).toBe("");
    expect(adjustmentSignature("paco", ["stats:read", "otto:delete"], ["pmr:read"])).toBe(
      "paco|+otto:delete|+stats:read|-pmr:read",
    );
  });
});
