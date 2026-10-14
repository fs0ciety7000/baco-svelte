// Garde-fous des rôles côté PocketBase (pocketbase/pb_hooks/lib/roles.js, lot L3), testés ici avec une fausse « app » :
// le cas « dernier administrateur actif » ne se teste pas sur une base qui a de vrais administrateurs (test-rules).
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CATALOG_KEYS, roleDefaults } from "./catalog";

const HOOKS = path.resolve(process.cwd(), "../pocketbase/pb_hooks");
const LIB = path.join(HOOKS, "lib/roles.js");

type Rec = { id: string; getString: (k: string) => string; isSuperuser?: () => boolean };
type RolesLib = {
  normalizePerms: (key: string, list: string[]) => string[];
  unknownKeys: (list: string[]) => string[];
  assertNotLastAdmin: (app: unknown, record: Rec, nextRole: string) => void;
  assertCanAssign: (auth: Rec | null, nextRole: string, prevRole: string) => void;
};

function load(): RolesLib | null {
  if (!existsSync(LIB)) return null;
  const g = globalThis as Record<string, unknown>;
  g.__hooks = HOOKS;
  g.BadRequestError = class extends Error {
    status = 400;
  };
  g.ForbiddenError = class extends Error {
    status = 403;
  };
  g.$dbx = { exp: (s: string, p: unknown) => ({ s, p }), hashExp: (p: unknown) => ({ p }) };
  return createRequire(import.meta.url)(LIB) as RolesLib;
}

const rec = (id: string, role: string, superuser = false): Rec => ({
  id,
  getString: (k) => (k === "role" ? role : ""),
  isSuperuser: () => superuser,
});

describe.skipIf(!existsSync(LIB))("garde-fous des rôles (hooks PocketBase)", () => {
  const lib = load()!;

  it("permissions d'un rôle : catalogue seulement, dépendances ajoutées, ordre du catalogue", () => {
    expect(lib.normalizePerms("x", ["journal:moderate", "pirate:read"])).toEqual([
      "journal:read",
      "journal:moderate",
    ]);
    expect(lib.normalizePerms("admin", [])).toEqual(CATALOG_KEYS);
    expect(lib.normalizePerms("screen", CATALOG_KEYS)).toEqual([]);
    for (const r of ["moderator", "paco", "guest"])
      expect(lib.normalizePerms(r, roleDefaults(r)), r).toEqual(roleDefaults(r));
    expect(lib.unknownKeys(["otto:read", "audit:read"])).toEqual(["audit:read"]);
  });

  it("dernier administrateur actif : désactivation, rétrogradation, suppression refusées", () => {
    const app = (others: number) => ({ countRecords: () => others });
    const admin = rec("a1", "admin");
    for (const next of ["disabled", "paco", ""])
      expect(() => lib.assertNotLastAdmin(app(0), admin, next), next).toThrow(
        /Dernier administrateur/,
      );
    expect(() => lib.assertNotLastAdmin(app(1), admin, "disabled")).not.toThrow();
    expect(() => lib.assertNotLastAdmin(app(0), admin, "admin")).not.toThrow();
    expect(() => lib.assertNotLastAdmin(app(0), rec("s1", "sysop"), "paco")).not.toThrow();
  });

  it("admin / sysop attribués par un administrateur (ou un superuser) seulement", () => {
    expect(() => lib.assertCanAssign(rec("s", "sysop"), "admin", "paco")).toThrow();
    expect(() => lib.assertCanAssign(rec("s", "sysop"), "sysop", "paco")).toThrow();
    expect(() => lib.assertCanAssign(rec("s", "sysop"), "paco", "guest")).not.toThrow();
    expect(() => lib.assertCanAssign(rec("s", "sysop"), "admin", "admin")).not.toThrow();
    expect(() => lib.assertCanAssign(rec("a", "admin"), "sysop", "paco")).not.toThrow();
    expect(() => lib.assertCanAssign(rec("r", "", true), "admin", "")).not.toThrow();
    expect(() => lib.assertCanAssign(null, "admin", "")).toThrow();
  });
});
