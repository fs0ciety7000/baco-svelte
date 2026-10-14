import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ACCOUNT_LINKS, ADMIN, CHANGELOG_LINK, MODULES, QUICK_ACTIONS } from "@/navigation";

import { HOME_CHOICES, homeOf } from "./home";
import { LEGACY_REDIRECTS } from "./redirects";

const APP = path.resolve(process.cwd(), "src/app/(app)");

/** Une page existe pour ce chemin (`:id` → `[id]`). */
function pageExists(route: string): boolean {
  const parts = route
    .split("/")
    .filter(Boolean)
    .map((p) => (p.startsWith(":") ? `[${p.slice(1)}]` : p));
  return existsSync(path.join(APP, ...parts, "page.tsx"));
}

describe("redirections des anciennes routes (navigation v3)", () => {
  it("chaque cible est une page existante, chaque source n'en est plus une", () => {
    for (const r of LEGACY_REDIRECTS) {
      expect(pageExists(r.destination), `${r.source} → ${r.destination}`).toBe(true);
      expect(pageExists(r.source), `${r.source} existe encore`).toBe(false);
    }
  });

  it("jamais deux redirections de suite, sources uniques, jamais /api", () => {
    const sources = LEGACY_REDIRECTS.map((r) => r.source);
    expect(new Set(sources).size).toBe(sources.length);
    for (const r of LEGACY_REDIRECTS) {
      expect(sources, r.destination).not.toContain(r.destination);
      expect(r.source.startsWith("/api")).toBe(false);
    }
  });

  it("toutes les anciennes routes du menu sont couvertes", () => {
    const old = [
      "/operations",
      "/operations/statistiques",
      "/operations/carte-pn",
      "/referentiels",
      "/referentiels/trains",
      "/referentiels/lignes",
      "/referentiels/gares",
      "/referentiels/ptcar",
      "/referentiels/ebp",
      "/referentiels/documents",
      "/equipe",
      "/equipe/planning",
      "/equipe/profil",
      "/commandes/b201",
    ];
    for (const o of old) expect(LEGACY_REDIRECTS.map((r) => r.source)).toContain(o);
    // Alias gardé (script de connexion des extensions installées) : servi, pas redirigé.
    expect(pageExists("/pmr/extension")).toBe(true);
  });

  it("chaque lien de la navigation mène à une page", () => {
    const hrefs = [
      ...MODULES.flatMap((m) => [m.href, ...m.tabs.map((t) => t.href)]),
      ...ADMIN.tabs.map((t) => t.href),
      ...ACCOUNT_LINKS.map((l) => l.href),
      ...QUICK_ACTIONS.map((a) => a.href),
      ...HOME_CHOICES.map((c) => c.href),
      CHANGELOG_LINK.href,
    ];
    for (const h of hrefs) expect(pageExists(h), h).toBe(true);
  });

  it("page d'accueil enregistrée avant la v3 : convertie", () => {
    expect(homeOf({ home: "/operations" })).toBe("/reseau");
    expect(homeOf({ home: "/referentiels" })).toBe("/ressources");
    expect(homeOf({ home: "/commandes" })).toBe("/commandes/suivi");
    expect(homeOf({ home: "/operations/journal" })).toBe("/operations/journal");
    expect(homeOf({ home: "https://ailleurs" })).toBe("/");
  });
});
