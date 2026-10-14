import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { can, PERMISSION_KEYS } from "../permissions";

import { CATALOG, CATALOG_KEYS, roleDefaults, TASKS } from "./catalog";
import { catalogModule } from "./catalog-module";
import { computePerms } from "./compute";

const HOOKS = path.resolve(process.cwd(), "../pocketbase/pb_hooks");
const COPY = path.join(HOOKS, "lib/catalog.js");
const LEGACY_READ = ["planning:read", "bus:read", "taxi:read", "ops:read", "lignes:read"];
const ROLES = ["admin", "sysop", "moderator", "paco", "guest", "screen", "disabled", "connector"];

// Rôles par défaut v2 tels qu'écrits dans permissions.ts avant le lot L0 (preuve d'équivalence).
const V2_DEFAULTS: Record<string, string[]> = {
  moderator: [...PERMISSION_KEYS, ...LEGACY_READ],
  paco: [...PERMISSION_KEYS.filter((k) => !k.endsWith(":delete")), ...LEGACY_READ],
  guest: ["otto:read", "generate_taxi:read"],
  screen: [],
  disabled: [],
  connector: [],
};

// Tests de rôle en dur d'avant le lot L2 (isJournalModerator, canEditChangelog, isCoordinator des bons et du PMR),
// recopiés tels quels : référence d'équivalence des clés nouvelles.
const ADMIN = (r: string) => r === "admin" || r === "sysop";
const isJournalModerator = (r: string) => ADMIN(r) || r === "moderator";
const canEditChangelog = (r: string) => ADMIN(r) || r === "moderator";
const isCoordinator = (r: string) => ADMIN(r) || r === "moderator" || r === "paco";

// Ancien `can()` (avant L1), recopié tel quel.
function canV2(role: string, grants: string[], denies: string[], p: string): boolean {
  if (role === "disabled" || role === "screen") return false;
  if (role === "admin" || role === "sysop") return true;
  if (grants.includes(p)) return true;
  if (denies.includes(p)) return false;
  return (V2_DEFAULTS[role] ?? []).includes(p);
}

describe("catalogue v3 (L0)", () => {
  it("couvre exactement les clés v2 (catalogue de l'admin + lectures BACO)", () => {
    const v2 = CATALOG.filter((e) => e.v2).map((e) => e.key);
    expect([...v2].sort()).toEqual([...PERMISSION_KEYS, ...LEGACY_READ].sort());
  });

  it("clés uniques, bien formées, tâches connues, dépendances et héritages existants", () => {
    expect(new Set(CATALOG_KEYS).size).toBe(CATALOG_KEYS.length);
    const tasks = new Set(TASKS.map((t) => t.id));
    for (const e of CATALOG) {
      // Testées par `perms ~ '"clé"'` (guillemets compris) : forme stricte.
      expect(e.key).toMatch(/^[a-z0-9_]+:[a-z]+$/);
      expect(tasks.has(e.task), e.key).toBe(true);
      expect(e.label.length, e.key).toBeGreaterThan(3);
      expect(e.sentence.startsWith("Peut") || e.task === "baco", e.key).toBe(true);
      for (const r of [...e.requires, ...e.legacy]) expect(CATALOG_KEYS, e.key).toContain(r);
      expect(e.requires, e.key).not.toContain(e.key);
    }
  });

  it("rôles par défaut identiques aux rôles v2 pour les clés v2", () => {
    const v2 = new Set([...PERMISSION_KEYS, ...LEGACY_READ]);
    for (const role of Object.keys(V2_DEFAULTS)) {
      const got = roleDefaults(role).filter((k) => v2.has(k));
      expect([...got].sort(), role).toEqual([...(V2_DEFAULTS[role] ?? [])].sort());
    }
    expect(roleDefaults("admin")).toEqual(CATALOG_KEYS);
    expect(roleDefaults("sysop")).toEqual(CATALOG_KEYS);
  });

  it("les nouvelles clés reprennent les tests de rôle en dur qu'elles remplaceront (L2)", () => {
    for (const role of ROLES) {
      const perms = computePerms(role);
      const has = (k: string) => perms.includes(k);
      const active = !["screen", "disabled", "connector"].includes(role);
      expect(has("journal:moderate"), role).toBe(active && isJournalModerator(role));
      expect(has("changelog:write"), role).toBe(active && canEditChangelog(role));
      expect(has("bus:reopen"), role).toBe(active && isCoordinator(role));
      expect(has("taxi:reopen"), role).toBe(active && isCoordinator(role));
      expect(has("pmr_equipment:manage"), role).toBe(active && isCoordinator(role));
      // Exclusions `role != "guest"` (règles, navigation `hideFor`, écrans).
      for (const k of [
        "suppliers:read",
        "pmr_zones:read",
        "spi:read",
        "changelog:read",
        "presence:read",
        "team:read",
        "quinyx:read",
        "timetable:read",
      ]) {
        expect(has(k), `${role} ${k}`).toBe(active && role !== "guest");
      }
    }
  });
});

describe("copie pour les hooks PocketBase", () => {
  it.skipIf(!existsSync(COPY))(
    "pocketbase/pb_hooks/lib/catalog.js est à jour (npm run catalog)",
    () => {
      expect(readFileSync(COPY, "utf8")).toBe(catalogModule());
    },
  );
});

describe("calcul de users.perms (L1)", () => {
  const hookPerms = (): ((role: string, g: string[], d: string[]) => string[]) | null => {
    if (!existsSync(path.join(HOOKS, "lib/perms.js"))) return null;
    (globalThis as { __hooks?: string }).__hooks = HOOKS;
    const req = createRequire(import.meta.url);
    return (req(path.join(HOOKS, "lib/perms.js")) as { computePerms: never }).computePerms;
  };

  it("admin / sysop : tout ; écran, désactivé, connecteur : rien, même accordé", () => {
    expect(computePerms("admin", [], ["otto:read"])).toEqual(CATALOG_KEYS);
    for (const r of ["screen", "disabled", "connector"]) {
      expect(computePerms(r, ["otto:read", "pmr:read"], [])).toEqual([]);
    }
    expect(computePerms("inconnu")).toEqual([]);
  });

  it("accordé l'emporte sur retiré, retiré sur le rôle ; dépendances retirées", () => {
    expect(computePerms("guest", ["otto:write"], [])).toContain("otto:write");
    expect(computePerms("paco", ["otto:delete"], ["otto:delete"])).toContain("otto:delete");
    expect(computePerms("paco", [], ["otto:update"])).not.toContain("otto:update");
    // Sans lecture, ni création ni modification (ni réouverture qui exige la modification).
    const noRead = computePerms("paco", [], ["otto:read"]);
    expect(noRead).not.toContain("otto:write");
    expect(noRead).not.toContain("bus:reopen");
    expect(computePerms("paco", [], ["otto:update"])).not.toContain("bus:reopen");
  });

  it("équivalent à l'ancien can() pour chaque rôle et chaque droit accordé ou retiré seul", () => {
    const v2 = [...PERMISSION_KEYS, ...LEGACY_READ];
    for (const role of ROLES) {
      for (const k of [null, ...v2]) {
        for (const kind of ["grant", "deny"] as const) {
          const g = kind === "grant" && k ? [k] : [];
          const d = kind === "deny" && k ? [k] : [];
          const perms = computePerms(role, g, d);
          for (const p of v2) {
            const old = (q: string) => (role === "connector" ? false : canV2(role, g, d, q));
            // Seul écart voulu : une action dont la lecture est retirée disparaît aussi.
            const entry = CATALOG.find((e) => e.key === p);
            const expected = old(p) && (entry?.requires ?? []).every(old);
            expect(perms.includes(p), `${role} ${kind} ${k} → ${p}`).toBe(expected);
          }
        }
      }
    }
  });

  it("le hook calcule exactement comme le web", () => {
    const hook = hookPerms();
    if (!hook) return;
    const samples: [string, string[], string[]][] = [];
    for (const role of [...ROLES, "inconnu"]) {
      samples.push([role, [], []]);
      for (const k of CATALOG_KEYS) {
        samples.push([role, [k], []], [role, [], [k]], [role, [k], [k]]);
      }
      samples.push([
        role,
        ["otto:delete", "dicos:write", "audit:read"],
        ["otto:read", "journal:read"],
      ]);
    }
    for (const [role, g, d] of samples) {
      expect(hook(role, g, d), `${role} +${g} -${d}`).toEqual(computePerms(role, g, d));
    }
  });
});

describe("can() lit users.perms", () => {
  it("perms fait foi pour les clés du catalogue ; ancien calcul sinon", () => {
    const paco = { role: "paco" as const, perms: ["otto:read"] };
    expect(can(paco, "otto:read")).toBe(true);
    expect(can(paco, "otto:write")).toBe(false);
    // Hors catalogue : grants (droits repris de BACO, `dicos:write`…).
    expect(can({ ...paco, grants: ["dicos:write"] }, "dicos:write")).toBe(true);
    // Sans perms : ancien calcul.
    expect(can({ role: "paco" }, "otto:write")).toBe(true);
    expect(can({ role: "moderator" }, "journal:moderate")).toBe(true);
    expect(can({ role: "screen", perms: CATALOG_KEYS }, "otto:read")).toBe(false);
  });
});
