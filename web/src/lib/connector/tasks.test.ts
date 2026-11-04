import { describe, expect, it } from "vitest";

import {
  claimLease,
  computeTasks,
  freeTasks,
  LEASE_MINUTES,
  outcomeText,
  parseHours,
  releaseLease,
  type Freshness,
  type LeaseStore,
} from "./tasks";

const now = new Date("2026-11-04T10:00:00Z");
const minAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const base = (o: Partial<Freshness> = {}): Freshness => ({
  hour: 11,
  today: "2026-11-04",
  tomorrow: "2026-11-05",
  dicos: {},
  quinyx: undefined,
  now,
  ...o,
});

describe("computeTasks", () => {
  it("jamais synchronisé : DICOS aujourd'hui et demain demandés", () => {
    expect(computeTasks(base()).map((t) => t.id)).toEqual(["dicos:2026-11-04", "dicos:2026-11-05"]);
  });

  it("seuils : 30 min aujourd'hui, 2 h demain, 3 h Quinyx", () => {
    const t = computeTasks(
      base({
        dicos: { "2026-11-04": minAgo(29), "2026-11-05": minAgo(121) },
        quinyx: minAgo(181),
      }),
    );
    expect(t.map((x) => x.id)).toEqual(["dicos:2026-11-05", "quinyx"]);
    expect(t[1]!.reason).toBe("Quinyx : dernière synchro il y a 3 h 01");
  });

  it("aucun groupe Quinyx activé : pas de tâche Quinyx ; jamais synchronisé : demandée", () => {
    expect(
      computeTasks(base({ dicos: { "2026-11-04": minAgo(1), "2026-11-05": minAgo(1) } })),
    ).toEqual([]);
    expect(
      computeTasks(
        base({ dicos: { "2026-11-04": minAgo(1), "2026-11-05": minAgo(1) }, quinyx: null }),
      )[0]!.id,
    ).toBe("quinyx");
  });

  it("hors des heures de service ou coupé : rien", () => {
    expect(computeTasks(base({ hour: 5 }))).toEqual([]);
    expect(computeTasks(base({ hour: 22 }))).toEqual([]);
    expect(computeTasks(base({ hours: null }))).toEqual([]);
    expect(computeTasks(base({ hour: 5, hours: { from: 0, to: 24 } }))).toHaveLength(2);
  });
});

describe("parseHours", () => {
  it("défaut, off, invalide", () => {
    expect(parseHours(undefined)).toEqual({ from: 6, to: 22 });
    expect(parseHours("off")).toBeNull();
    expect(parseHours("5-23")).toEqual({ from: 5, to: 23 });
    expect(parseHours("22-6")).toEqual({ from: 6, to: 22 });
  });
});

describe("baux", () => {
  it("un seul poste à la fois, repris à l'expiration, libéré par son détenteur seulement", () => {
    const s: LeaseStore = new Map();
    const t = now.getTime();
    expect(claimLease(s, "dicos:x", "a", t)).toBe(true);
    expect(claimLease(s, "dicos:x", "b", t + 1000)).toBe(false);
    expect(claimLease(s, "dicos:x", "a", t + 1000)).toBe(true);
    releaseLease(s, "dicos:x", "b");
    expect(s.has("dicos:x")).toBe(true);
    expect(claimLease(s, "dicos:x", "b", t + LEASE_MINUTES * 60_000 + 2000)).toBe(true);
    releaseLease(s, "dicos:x", "b");
    expect(s.has("dicos:x")).toBe(false);
  });

  it("tâches libres : celles réservées par un autre poste sont masquées", () => {
    const s: LeaseStore = new Map();
    const tasks = computeTasks(base());
    claimLease(s, tasks[0]!.id, "a", now.getTime());
    expect(freeTasks(tasks, s, "b", now.getTime()).map((x) => x.id)).toEqual(["dicos:2026-11-05"]);
    expect(freeTasks(tasks, s, "a", now.getTime())).toHaveLength(2);
  });
});

describe("outcomeText", () => {
  it("phrases", () => {
    expect(outcomeText(null)).toBe("aucun passage automatique");
    expect(
      outcomeText({
        id: "x",
        kind: "dicos",
        ok: false,
        code: "no-dicos",
        at: 0,
        by: "",
        version: "",
      }),
    ).toContain("aucun onglet DICOS");
  });
});
