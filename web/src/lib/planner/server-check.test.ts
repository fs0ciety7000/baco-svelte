import { describe, expect, it } from "vitest";

import { assignOnServer, manualDayAllowed, manualStationIssue } from "./server-check";
import { BASES, BCS, agent, pmr, toAgent } from "./test-fixtures";
import type { PlannerContext, PlannerTask } from "./types";

// Données FICTIVES.
const AGENTS = [agent("pa1", "PA", "FMS"), agent("cr1", "CPI", "FCR")];
const ctx = (tasks: PlannerTask[]): PlannerContext => ({
  tasks,
  agents: AGENTS,
  bases: BASES,
  bcs: BCS,
});

describe("attribution contrôlée côté serveur", () => {
  it("refus (block) avec la raison ; avertissement accepté ; contexte cumulé", () => {
    const busy = pmr("busy", { time: "09:00", train: "1", assignee: toAgent("pa1") });
    const t = pmr("t", { time: "09:05", train: "2" });
    const c = ctx([busy, t]);
    const occ = assignOnServer(c, "t", "Mons", { kind: "agent", agentId: "pa1" });
    expect(occ).toMatchObject({ ok: false });
    expect(!occ.ok && occ.error).toMatch(/^Attribution refusée : Occupé/);
    const far = assignOnServer(c, "t", "Mons", { kind: "agent", agentId: "cr1" });
    expect(far.ok).toBe(false);
    // Déborde du service = avertissement : accepté.
    const late = pmr("late", { time: "13:58", train: "3" });
    expect(assignOnServer(ctx([late]), "late", "Mons", toAgent("pa1")).ok).toBe(true);
    // Lot : la seconde tâche est contrôlée avec la première posée.
    const a = pmr("a", { time: "10:00", train: "4" });
    const b = pmr("b", { time: "10:05", train: "5" });
    const first = assignOnServer(ctx([a, b]), "a", "Mons", toAgent("pa1"));
    expect(first.ok).toBe(true);
    const second = first.ok && assignOnServer(first.ctx, "b", "Mons", toAgent("pa1"));
    expect(second && second.ok).toBe(false);
  });

  it("guichet B-CS : celui de la gare de la tâche seulement ; taxi toujours permis", () => {
    const n = pmr("n", { time: "08:00", station: "Nivelles", train: "N1" });
    const other = assignOnServer(ctx([n]), "n", "Nivelles", { kind: "bcs", label: "Tamines" });
    expect(other).toEqual({
      ok: false,
      error: "Ce guichet est à Tamines : choisis celui de Nivelles.",
    });
    expect(assignOnServer(ctx([n]), "n", "Nivelles", { kind: "bcs" }).ok).toBe(true);
    expect(assignOnServer(ctx([n]), "n", "Nivelles", { kind: "taxi" }).ok).toBe(true);
  });
});

describe("tâches encodées à la main", () => {
  it("jour permis : J-2 → J+60", () => {
    expect(manualDayAllowed("2026-10-13", "2026-10-15")).toBe(true);
    expect(manualDayAllowed("2026-10-12", "2026-10-15")).toBe(false);
    expect(manualDayAllowed("2026-12-14", "2026-10-15")).toBe(true);
    expect(manualDayAllowed("2026-12-15", "2026-10-15")).toBe(false);
  });

  it("gare inconnue refusée, message sans le contenu de la ligne", () => {
    const known = new Set(["Mons", "Tournai"]);
    expect(
      manualStationIssue([{ kind: "pmr_in", station: "Mons", other_station: "Tournai" }], known),
    ).toBeNull();
    const bad = manualStationIssue(
      [
        { kind: "pmr_in", station: "Mons", other_station: "" },
        { kind: "pmr_out", station: "Tournai Jean Test", other_station: "Mons" },
      ],
      known,
    );
    expect(bad).toBe("Ligne 2 : gare inconnue, vérifie l'orthographe.");
    expect(
      manualStationIssue([{ kind: "pmr_in", station: "Mons", other_station: "Lile Jean" }], known),
    ).toBe("Ligne 1 : autre gare inconnue, vérifie l'orthographe.");
    expect(manualStationIssue([{ kind: "pmr_in", station: "", other_station: "" }], known)).toBe(
      "Ligne 1 : gare manquante pour une prise en charge PMR.",
    );
    // Tâche technique sans gare : permise.
    expect(
      manualStationIssue([{ kind: "technique", station: "", other_station: "" }], known),
    ).toBeNull();
  });
});
