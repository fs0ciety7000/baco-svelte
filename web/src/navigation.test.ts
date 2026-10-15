import { describe, expect, it } from "vitest";

import {
  accountLinks,
  activeModule,
  activeTab,
  adminModule,
  MODULES,
  quickActions,
  visibleModules,
} from "./navigation";

describe("navigation", () => {
  it("6 modules au plus, 4 dans la barre mobile + « Plus » (Accueil, Opérations, Bons, PMR)", () => {
    expect(MODULES.length).toBeLessThanOrEqual(6);
    expect(MODULES.filter((m) => m.mobile).map((m) => m.id)).toEqual([
      "accueil",
      "operations",
      "commandes",
      "pmr",
    ]);
  });

  it("arborescence v3 (14 oct. 2026) : modules et onglets dans l'ordre", () => {
    const mods = visibleModules({ role: "admin" });
    const tabs = (id: string) => mods.find((m) => m.id === id)?.tabs.map((t) => t.label);
    expect(mods.map((m) => m.id)).toEqual([
      "accueil",
      "operations",
      "commandes",
      "pmr",
      "reseau",
      "ressources",
    ]);
    expect(tabs("accueil")).toEqual(["À traiter", "Statistiques"]);
    expect(tabs("operations")).toEqual(["Journal", "Ma journée", "B201"]);
    expect(tabs("commandes")).toEqual(["Suivi", "Bus", "Taxi", "Archives", "Fournisseurs"]);
    expect(tabs("pmr")).toEqual([
      "Missions",
      "Groupes",
      "Planificateur",
      "Clients",
      "Matériel",
      "Historique",
    ]);
    expect(tabs("reseau")).toEqual([
      "Trains en direct",
      "Horaires",
      "Lignes",
      "Gares",
      "PtCar",
      "EBP",
      "Carte PN",
    ]);
    expect(tabs("ressources")).toEqual([
      "Contacts",
      "Collègues",
      "Planning",
      "Procédures et documents",
    ]);
  });

  it("chaque module ouvre sur l'écran que compte sa pastille (Journal, Suivi « À envoyer »)", () => {
    const mods = visibleModules({ role: "paco" });
    expect(mods.find((m) => m.id === "operations")?.href).toBe("/operations/journal");
    expect(mods.find((m) => m.id === "commandes")?.href).toBe("/commandes/suivi");
  });

  it("filtre selon les permissions : l'invité ne voit que les commandes bus et taxi (pas de module creux)", () => {
    const mods = visibleModules({ role: "guest" });
    expect(mods.map((m) => m.id)).toEqual(["accueil", "commandes"]);
    expect(mods.find((m) => m.id === "commandes")?.tabs.map((t) => t.label)).toEqual([
      "Suivi",
      "Bus",
      "Taxi",
    ]);
    // Le profil reste joignable par le menu du compte.
    expect(accountLinks({ role: "guest" }).map((l) => l.href)).toEqual(["/profil"]);
  });

  it("Suivi ouvert à l'agent « taxi seul »", () => {
    const taxiOnly = { role: "x", perms: ["generate_taxi:read"] };
    const mods = visibleModules(taxiOnly);
    expect(mods.find((m) => m.id === "commandes")?.tabs.map((t) => t.label)).toEqual([
      "Suivi",
      "Taxi",
    ]);
  });

  it("menu du compte : profil (sauf Écran), planning, extension", () => {
    expect(accountLinks({ role: "paco" }).map((l) => l.label)).toEqual([
      "Mon profil",
      "Mon planning",
      "Extension CSM",
    ]);
    expect(accountLinks({ role: "screen" })).toEqual([]);
    // Extension : missions PMR OU planning (DICOS, ATMS, Quinyx).
    expect(accountLinks({ role: "x", perms: ["quinyx:read"] }).map((l) => l.href)).toContain(
      "/extension",
    );
  });

  it("PACO/RCCA voit tous les modules, sauf l'administration", () => {
    const mods = visibleModules({ role: "paco" });
    expect(mods).toHaveLength(6);
    expect(adminModule({ role: "paco" })).toBeNull();
    expect(adminModule({ role: "moderator" })).toBeNull();
    expect(visibleModules({ role: "moderator" })).toHaveLength(6);
  });

  it("administration réservée à l'admin ; Référentiels ouvert à qui a referentiels:manage", () => {
    expect(adminModule({ role: "guest" })).toBeNull();
    expect(adminModule({ role: "admin" })?.href).toBe("/admin");
    expect(adminModule({ role: "admin" })?.tabs.map((t) => t.group)).toContain("Référentiels");
    const ref = adminModule({ role: "gest-ref", perms: ["referentiels:manage"] });
    expect(ref?.href).toBe("/admin/referentiels");
    expect(ref?.tabs.map((t) => t.href)).toEqual(["/admin/referentiels"]);
    expect(activeModule("/admin/referentiels/ptcar", visibleModules({ role: "admin" }))?.id).toBe(
      "admin",
    );
  });

  it("actions rapides selon les droits d'écriture", () => {
    expect(quickActions({ role: "guest" })).toEqual([]);
    expect(quickActions({ role: "paco" }).length).toBe(3);
  });

  it("module et onglet actifs (plus long préfixe)", () => {
    const mods = visibleModules({ role: "paco" });
    const m = activeModule("/commandes/taxi/42", mods);
    expect(m?.id).toBe("commandes");
    expect(activeTab("/commandes/taxi/42", m!)?.label).toBe("Taxi");
    expect(activeTab("/commandes", m!)?.label).toBe("Bus");
    expect(activeTab("/commandes/bus/abc", m!)?.label).toBe("Bus");
    expect(activeModule("/", mods)?.id).toBe("accueil");
    expect(activeModule("/statistiques", mods)?.id).toBe("accueil");
    expect(activeModule("/reseau/horaires", mods)?.id).toBe("reseau");
    expect(activeTab("/reseau/horaires", activeModule("/reseau/horaires", mods)!)?.label).toBe(
      "Horaires",
    );
    expect(activeTab("/reseau", activeModule("/reseau", mods)!)?.label).toBe("Trains en direct");
    expect(activeModule("/operations/b201", mods)?.id).toBe("operations");
    expect(activeTab("/operations/b201", activeModule("/operations/b201", mods)!)?.label).toBe(
      "B201",
    );
    expect(activeModule("/ressources/documents/voir/x", mods)?.id).toBe("ressources");
    expect(activeModule("/groupes", mods)?.id).toBe("pmr");
    expect(activeModule("/profil", mods)).toBeUndefined();
    expect(activeModule("/admin/audit", mods)?.id).toBe("admin");
  });
});
