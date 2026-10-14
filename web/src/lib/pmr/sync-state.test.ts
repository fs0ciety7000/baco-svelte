import { describe, expect, it } from "vitest";

import {
  daysBetweenInclusive,
  isAbsentFromDicos,
  latestSessions,
  syncSummary,
  type SyncRow,
} from "./sync-state";

const row = (day: string, created: string, complete = true, kind = "missions"): SyncRow => ({
  day,
  kind,
  created,
  complete,
});

describe("état de synchro DICOS", () => {
  it("énumère les jours de la période", () => {
    expect(daysBetweenInclusive("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    expect(daysBetweenInclusive("2026-10-02", "2026-10-01")).toEqual([]);
  });

  it("nomme les jours manquants et prend la fraîcheur du jour le moins récent", () => {
    const rows = [
      row("2026-10-10", "2026-10-10 09:00:00Z"),
      row("2026-10-11", "2026-10-09 20:00:00Z"),
    ];
    const s = syncSummary(rows, "2026-10-10", "2026-10-12", "missions");
    expect(s.missing).toEqual(["2026-10-12"]);
    expect(s.freshness).toBe("2026-10-09 20:00:00Z");
    expect(s.partialAt).toBeNull();
  });

  it("signale un dernier envoi sans son dernier lot, sans perdre la synchro complète d'avant", () => {
    const rows = [
      row("2026-10-10", "2026-10-10 10:00:00Z", false),
      row("2026-10-10", "2026-10-10 08:00:00Z", true),
    ];
    const s = syncSummary(rows, "2026-10-10", "2026-10-10", "missions");
    expect(s.missing).toEqual([]);
    expect(s.freshness).toBe("2026-10-10 08:00:00Z");
    expect(s.partialAt).toBe("2026-10-10 10:00:00Z");
  });

  it("dernière synchro = la plus récente de tous les agents, heure et agent de la même fiche", () => {
    const rows: SyncRow[] = [
      { ...row("2026-10-11", "2026-10-11 15:00:00Z"), by: "Bob" },
      { ...row("2026-10-10", "2026-10-11 14:00:00Z", false), by: "Carla" },
      { ...row("2026-10-10", "2026-10-11 03:00:00Z"), by: "Alice" },
    ];
    const s = syncSummary(rows, "2026-10-10", "2026-10-11", "missions");
    expect(s.latest).toEqual({ at: "2026-10-11 15:00:00Z", by: "Bob" });
    expect(s.freshness).toBe("2026-10-11 03:00:00Z");
    expect(s.oldestDay).toBe("2026-10-10");
  });

  it("groupes : la synchro des missions vaut pour un jour sans groupe", () => {
    const s = syncSummary(
      [row("2026-10-10", "2026-10-10 08:00:00Z")],
      "2026-10-10",
      "2026-10-10",
      "groups",
    );
    expect(s.missing).toEqual([]);
  });
});

describe("« Absente de DICOS »", () => {
  // Synchros complètes, de la plus récente à la plus ancienne.
  const sessions = latestSessions([
    { day: "2026-10-11", syncedBy: "agentA", sessionStart: "2026-10-11 09:00:00.000Z" },
    { day: "2026-10-11", syncedBy: "agentB", sessionStart: "2026-10-11 08:30:00.000Z" },
    { day: "2026-10-11", syncedBy: "agentA", sessionStart: "2026-10-11 07:00:00.000Z" },
    { day: "2026-10-11", syncedBy: "", sessionStart: "2026-10-11 09:30:00.000Z" },
  ]);
  const mission = (over: Record<string, string> = {}) => ({
    status: "prevue",
    day: "2026-10-11",
    lastSeenSync: "2026-10-11 07:00:05.000Z",
    lastSeenBy: "agentA",
    ...over,
  });

  it("garde la synchro complète la plus récente par jour et par agent", () => {
    expect(sessions.get("2026-10-11|agentA")).toBe("2026-10-11 09:00:00.000Z");
    expect(sessions.has("2026-10-11|")).toBe(false);
  });
  it("absente : la dernière synchro complète du même agent a commencé après la dernière fois où elle a été vue", () => {
    expect(isAbsentFromDicos(mission(), sessions)).toBe(true);
  });
  it("présente : vue pendant cette synchro (au début compris)", () => {
    expect(isAbsentFromDicos(mission({ lastSeenSync: "2026-10-11 09:00:00.000Z" }), sessions)).toBe(
      false,
    );
    expect(isAbsentFromDicos(mission({ lastSeenSync: "2026-10-11 09:04:00.000Z" }), sessions)).toBe(
      false,
    );
  });
  it("vue par un autre agent : jugée sur la synchro de celui-ci (vue DICOS filtrée par gares)", () => {
    expect(
      isAbsentFromDicos(
        mission({ lastSeenBy: "agentB", lastSeenSync: "2026-10-11 08:40:00.000Z" }),
        sessions,
      ),
    ).toBe(false);
    expect(isAbsentFromDicos(mission({ lastSeenBy: "agentC" }), sessions)).toBe(false);
  });
  it("jamais signalée : secret partagé, jamais vue, autre statut, autre jour", () => {
    expect(isAbsentFromDicos(mission({ lastSeenBy: "" }), sessions)).toBe(false);
    expect(isAbsentFromDicos(mission({ lastSeenSync: "" }), sessions)).toBe(false);
    expect(isAbsentFromDicos(mission({ status: "annulee" }), sessions)).toBe(false);
    expect(isAbsentFromDicos(mission({ day: "2026-10-12" }), sessions)).toBe(false);
  });
});
