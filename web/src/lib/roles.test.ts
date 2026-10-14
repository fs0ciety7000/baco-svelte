import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CATALOG_KEYS, roleDefaults } from "./permissions/catalog";
import {
  assignableRoles,
  avatarRing,
  DEFAULT_ROLES,
  roleFromRecord,
  roleLabel,
  type RoleMeta,
} from "./roles";

const MIGRATION = path.resolve(process.cwd(), "../pocketbase/pb_migrations/1760004500_roles.js");

describe("rôles (lot L3)", () => {
  it.skipIf(!existsSync(MIGRATION))(
    "rôles par défaut = rôles système de la migration 1760004500",
    () => {
      const mig = readFileSync(MIGRATION, "utf8");
      for (const r of DEFAULT_ROLES) {
        expect(mig, r.key).toContain(`key: '${r.key}', label: '${r.label}'`);
        expect(r.perms, r.key).toEqual(roleDefaults(r.key));
      }
    },
  );

  it("fiche PocketBase : couleur inconnue = neutre, clés hors catalogue écartées, admin = tout", () => {
    const r = roleFromRecord({
      key: "x-y",
      label: "X",
      color: "rose",
      perms: ["otto:read", "z:z"],
    });
    expect(r.color).toBe("neutral");
    expect(r.perms).toEqual(["otto:read"]);
    expect(roleFromRecord({ key: "admin", perms: [] }).perms).toEqual(CATALOG_KEYS);
  });

  it("libellés, anneau d'avatar, rôles attribuables", () => {
    const custom: RoleMeta = {
      ...DEFAULT_ROLES[3]!,
      key: "nuit",
      label: "Nuit",
      color: "info",
      system: false,
    };
    const roles = [...DEFAULT_ROLES, custom];
    expect(roleLabel("nuit", roles)).toBe("Nuit");
    expect(roleLabel("inconnu", roles)).toBe("inconnu");
    expect(avatarRing("admin", roles)).toContain("ring-2 ring-accent ring-offset-2");
    expect(avatarRing("paco", roles)).toContain("ring-1 ring-border-strong");
    expect(avatarRing("nuit", roles)).toContain("ring-2 ring-info");
    const keys = assignableRoles(roles).map((r) => r.key);
    expect(keys).not.toContain("disabled");
    expect(keys).not.toContain("connector");
    expect(keys).toContain("nuit");
  });
});
