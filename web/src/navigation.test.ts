import { describe, expect, it } from "vitest";

import {
  activeModule,
  activeTab,
  adminModule,
  MODULES,
  quickActions,
  visibleModules,
} from "./navigation";

describe("navigation", () => {
  it("6 modules au plus, 4 dans la barre mobile", () => {
    expect(MODULES.length).toBeLessThanOrEqual(6);
    expect(MODULES.filter((m) => m.mobile).length).toBe(4);
  });

  it("filtre selon les permissions : l'agent C3 ne voit que les commandes bus et les stats", () => {
    const mods = visibleModules({ role: "otto_agent" });
    expect(mods.map((m) => m.id)).toEqual(["accueil", "commandes", "operations"]);
    expect(mods.find((m) => m.id === "commandes")?.tabs.map((t) => t.label)).toEqual([
      "Bus",
      "Suivi",
    ]);
    // Le module pointe vers le premier onglet autorisé.
    expect(mods.find((m) => m.id === "operations")?.href).toBe("/operations/statistiques");
  });

  it("administration réservée à l'admin", () => {
    expect(adminModule({ role: "user" })).toBeNull();
    expect(adminModule({ role: "admin" })?.href).toBe("/admin");
  });

  it("actions rapides selon les droits d'écriture", () => {
    expect(quickActions({ role: "reader" })).toEqual([]);
    expect(quickActions({ role: "user" }).length).toBe(4);
  });

  it("module et onglet actifs", () => {
    const mods = visibleModules({ role: "user" });
    const m = activeModule("/commandes/taxi/42", mods);
    expect(m?.id).toBe("commandes");
    expect(activeTab("/commandes/taxi/42", m!)?.label).toBe("Taxi");
    expect(activeTab("/commandes", m!)?.label).toBe("Bus");
    expect(activeModule("/", mods)?.id).toBe("accueil");
    expect(activeModule("/admin/audit", mods)?.id).toBe("admin");
  });
});
