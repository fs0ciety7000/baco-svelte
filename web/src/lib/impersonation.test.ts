import { describe, expect, it } from "vitest";

import {
  STOP_PATH,
  actingAad,
  actingBlock,
  actingCookieValue,
  actingExpired,
  impersonationRefusal,
  isBlockedRead,
  isPbRead,
  parseActingCookie,
  readOnlyMessage,
} from "./impersonation";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImFiYyJ9.c2lnbmF0dXJl";
const ADMIN = "abcdefghijklmno";
const UUID = "0f8b1c2d-3e4f-5a6b-7c8d-9e0f1a2b3c4d";

describe("cookie du mode", () => {
  const SEALED = "A".repeat(60);
  it("aller-retour", () => {
    expect(parseActingCookie(actingCookieValue(ADMIN, UUID, 1760000000, SEALED))).toEqual({
      adminId: ADMIN,
      targetId: UUID,
      exp: 1760000000,
      sealed: SEALED,
    });
  });
  it("le jeton n'est jamais en clair dans le cookie", () => {
    expect(parseActingCookie(`${ADMIN}~${JWT}`)).toBeNull();
    expect(parseActingCookie(`${ADMIN}~${UUID}~1760000000~${JWT}`)).toBeNull();
  });
  it("refuse les valeurs mal formées", () => {
    for (const v of [
      undefined,
      null,
      "",
      `${ADMIN}~${UUID}~1760000000`,
      `court~${UUID}~1760000000~${SEALED}`,
      `${ADMIN}~${UUID}~abc~${SEALED}`,
      `${ADMIN}~${UUID}~1760000000~court`,
      `${ADMIN}~${UUID}~1760000000~${SEALED}~x`,
      `${ADMIN.toUpperCase()}~${UUID}~1760000000~${SEALED}`,
    ])
      expect(parseActingCookie(v)).toBeNull();
  });
  it("expiration et données liées", () => {
    expect(actingExpired({ exp: 100 }, 101_000)).toBe(true);
    expect(actingExpired({ exp: 100 }, 99_000)).toBe(false);
    expect(actingAad({ adminId: ADMIN, targetId: UUID, exp: 5 })).toBe(`${ADMIN}~${UUID}~5`);
  });
});

describe("qui peut être consulté", () => {
  const admin = { id: ADMIN, role: "admin" };
  it("admin et sysop seulement", () => {
    expect(impersonationRefusal(admin, { id: UUID, role: "paco" })).toBeNull();
    expect(
      impersonationRefusal({ id: ADMIN, role: "sysop" }, { id: UUID, role: "guest" }),
    ).toBeNull();
    expect(
      impersonationRefusal({ id: ADMIN, role: "moderator" }, { id: UUID, role: "paco" }),
    ).toMatch(/administrateurs/);
    expect(
      impersonationRefusal({ id: ADMIN, role: "paco" }, { id: UUID, role: "guest" }),
    ).not.toBeNull();
  });
  it("cibles permises : modérateur, PACO/RCCA, invité, écran", () => {
    for (const role of ["moderator", "paco", "guest", "screen"])
      expect(impersonationRefusal(admin, { id: UUID, role })).toBeNull();
  });
  it("cibles refusées : autre admin / sysop, service, désactivé, soi-même", () => {
    for (const role of ["admin", "sysop", "connector", "disabled"])
      expect(impersonationRefusal(admin, { id: UUID, role })).not.toBeNull();
    expect(impersonationRefusal(admin, { id: ADMIN, role: "paco" })).toMatch(/toi-même/);
  });
});

describe("requêtes pendant le mode", () => {
  it("lectures permises", () => {
    expect(actingBlock("GET", "/commandes", false)).toBeNull();
    expect(actingBlock("HEAD", "/", false)).toBeNull();
    expect(actingBlock("GET", "/api/events", false)).toBeNull();
    expect(actingBlock("GET", "/api/avatar/abcdefghijklmno", false)).toBeNull();
    expect(actingBlock("GET", "/api/referentiels/documents/abcdefghijklmno", false)).toBeNull();
  });
  it("écritures refusées, sauf la fin du mode", () => {
    expect(actingBlock("POST", "/api/referentiels/documents", false)).toBe("write");
    expect(actingBlock("POST", "/api/operations/main-courante/x/fichiers", false)).toBe("write");
    expect(actingBlock("PUT", "/commandes", false)).toBe("write");
    expect(actingBlock("DELETE", "/api/x", false)).toBe("write");
    expect(actingBlock("PATCH", "/commandes", true)).toBe("write");
    expect(actingBlock("POST", "/commandes", false)).toBe("write");
    // Une Server Action vers une route /api n'existe pas : refusée quand même.
    expect(actingBlock("POST", "/api/pmr/missions/ingest", true)).toBe("write");
    expect(actingBlock("POST", STOP_PATH, false)).toBeNull();
  });
  it("Server Actions laissées au client PocketBase en lecture seule", () => {
    expect(actingBlock("POST", "/commandes/nouveau", true)).toBeNull();
  });
  it("exports nominatifs refusés en lecture", () => {
    for (const p of [
      "/api/pmr/export",
      "/api/admin/audit/export",
      "/api/referentiels/gares/export",
      "/api/operations/statistiques/export",
      "/api/operations/main-courante/export",
      "/api/pmr/feuille-de-route",
      "/api/commandes/bus/abc/pdf",
      "/api/commandes/taxi/abc/eml",
      "/api/commandes/b201/2026-10-14/pdf",
      "/api/commandes/archives/abc",
      "/api/commandes/archives/sauvegardes/abc",
      "/api/operations/main-courante/abc/fichiers/photo.png",
    ]) {
      expect(isBlockedRead(p), p).toBe(true);
      expect(actingBlock("GET", p, false)).toBe("export");
    }
    expect(isBlockedRead("/commandes/archives")).toBe(false);
    expect(isBlockedRead("/api/pmr/extension/csm.zip")).toBe(false);
  });
});

describe("client PocketBase de la cible", () => {
  it("lecture seule, jeton de fichier permis", () => {
    expect(isPbRead("GET", "http://pb/api/collections/users/records")).toBe(true);
    expect(isPbRead(undefined, "http://pb/api/collections/users/records")).toBe(true);
    expect(isPbRead("POST", "http://pb/api/files/token")).toBe(true);
    expect(isPbRead("POST", "http://pb/api/collections/bus_orders/records")).toBe(false);
    expect(isPbRead("PATCH", "http://pb/api/collections/users/records/x")).toBe(false);
    expect(isPbRead("DELETE", "http://pb/api/collections/users/records/x")).toBe(false);
    expect(isPbRead("POST", "http://pb/api/batch")).toBe(false);
    expect(isPbRead("POST", "http://pb/api/files/token/../../collections/x/records")).toBe(false);
  });
  it("message", () => {
    expect(readOnlyMessage("Ana")).toBe("Lecture seule : tu vois CSM en tant que Ana.");
    expect(readOnlyMessage()).toMatch(/^Lecture seule/);
  });
});
