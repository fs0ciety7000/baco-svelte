import { describe, expect, it } from "vitest";

import {
  archivesVerdict,
  backupVerdict,
  cronVerdict,
  everyLabel,
  formatBytes,
  toMs,
  type CronRun,
} from "./supervision";

const NOW = Date.parse("2026-10-11T12:00:00Z");
const run = (over: Partial<CronRun>): CronRun => ({
  name: "irail-journal",
  lastStart: "2026-10-11 11:55:00.000Z",
  lastEnd: "2026-10-11 11:55:01.000Z",
  ok: true,
  error: "",
  lastErrorAt: "",
  durationMs: 1000,
  runs: 3,
  expectedMin: 5,
  ...over,
});

describe("supervision : verdicts", () => {
  it("lit les dates PocketBase et ISO", () => {
    expect(toMs("2026-10-11 12:00:00.000Z")).toBe(NOW);
    expect(toMs("2026-10-11T12:00:00.000Z")).toBe(NOW);
    expect(Number.isNaN(toMs(""))).toBe(true);
  });

  it("tâches planifiées : ok, retard, erreur, jamais passée", () => {
    expect(cronVerdict(run({}), NOW)).toBe("ok");
    // 5 min attendues : retard au-delà de 15 min.
    expect(cronVerdict(run({ lastEnd: "2026-10-11 11:46:00.000Z" }), NOW)).toBe("ok");
    expect(cronVerdict(run({ lastEnd: "2026-10-11 11:40:00.000Z" }), NOW)).toBe("warn");
    expect(cronVerdict(run({ ok: false, error: "boom" }), NOW)).toBe("danger");
    expect(cronVerdict(run({ runs: 0, lastEnd: "" }), NOW)).toBe("idle");
    // Tâche de nuit passée hier : ok.
    expect(cronVerdict(run({ expectedMin: 1440, lastEnd: "2026-10-10 03:50:02.000Z" }), NOW)).toBe(
      "ok",
    );
  });

  it("sauvegarde : fraîche, à surveiller, absente", () => {
    expect(backupVerdict("2026-10-11T02:00:00.000Z", NOW)).toBe("ok");
    expect(backupVerdict("2026-10-10T02:00:00.000Z", NOW)).toBe("warn");
    expect(backupVerdict("2026-10-08T02:00:00.000Z", NOW)).toBe("danger");
    expect(backupVerdict(undefined, NOW)).toBe("danger");
  });

  it("archives des bons", () => {
    expect(archivesVerdict({ r2: false, pending: 40 })).toBe("idle");
    expect(archivesVerdict({ r2: true, pending: 3, errors: 0 })).toBe("ok");
    expect(archivesVerdict({ r2: true, pending: 30, errors: 0 })).toBe("warn");
    expect(archivesVerdict({ r2: true, pending: 3, errors: 1 })).toBe("danger");
    expect(archivesVerdict({ error: "x" })).toBe("danger");
  });

  it("libellés", () => {
    expect(formatBytes(512)).toBe("512 o");
    expect(formatBytes(390654)).toBe("381 Ko");
    expect(everyLabel(5)).toBe("toutes les 5 min");
    expect(everyLabel(1440)).toBe("chaque nuit");
    expect(everyLabel(0)).toBe("—");
  });
});
