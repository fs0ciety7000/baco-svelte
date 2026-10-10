import { describe, expect, it } from "vitest";

import { daysBetweenInclusive, syncSummary, type SyncRow } from "./sync-state";

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
