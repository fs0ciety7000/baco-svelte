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
  it("6 modules au plus, 4 dans la barre mobile + « Plus » (14 oct. 2026)", () => {
    expect(MODULES.length).toBeLessThanOrEqual(6);
    expect(MODULES.filter((m) => m.mobile).length).toBe(4);
  });

  it("filtre selon les permissions : l'invité ne voit que les commandes bus et taxi (rôles v2)", () => {
    const mods = visibleModules({ role: "guest" });
    // « Équipe » : seulement « Mon profil » (changer son mot de passe) pour l'invité.
    expect(mods.map((m) => m.id)).toEqual(["accueil", "commandes", "equipe"]);
    expect(mods.find((m) => m.id === "equipe")?.href).toBe("/equipe/profil");
    expect(mods.find((m) => m.id === "commandes")?.tabs.map((t) => t.label)).toEqual([
      "Bus",
      "Taxi",
      "Suivi",
    ]);
  });

  it("PACO/RCCA voit tous les modules, sauf l'administration", () => {
    const mods = visibleModules({ role: "paco" });
    expect(mods.map((m) => m.id)).toEqual([
      "accueil",
      "commandes",
      "pmr",
      "operations",
      "referentiels",
      "equipe",
    ]);
    expect(adminModule({ role: "paco" })).toBeNull();
    expect(adminModule({ role: "moderator" })).toBeNull();
    expect(visibleModules({ role: "moderator" }).map((m) => m.id)).toHaveLength(6);
  });

  it("administration réservée à l'admin", () => {
    expect(adminModule({ role: "guest" })).toBeNull();
    expect(adminModule({ role: "admin" })?.href).toBe("/admin");
  });

  it("actions rapides selon les droits d'écriture", () => {
    expect(quickActions({ role: "guest" })).toEqual([]);
    expect(quickActions({ role: "paco" }).length).toBe(3);
  });

  it("module et onglet actifs", () => {
    const mods = visibleModules({ role: "paco" });
    const m = activeModule("/commandes/taxi/42", mods);
    expect(m?.id).toBe("commandes");
    expect(activeTab("/commandes/taxi/42", m!)?.label).toBe("Taxi");
    expect(activeTab("/commandes", m!)?.label).toBe("Bus");
    expect(activeModule("/", mods)?.id).toBe("accueil");
    expect(activeModule("/admin/audit", mods)?.id).toBe("admin");
  });
});
