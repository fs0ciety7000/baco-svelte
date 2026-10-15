import { describe, expect, it } from "vitest";

import {
  agentMatches,
  applyOverrides,
  bcsOpen,
  blockLabel,
  boardCounters,
  conflictsOf,
  dayBounds,
  dropVerdict,
  filterTodo,
  groupAgents,
  hourTicks,
  isBusyRefusal,
  linkedIds,
  rowBlocks,
  settledOverrides,
  stationZones,
  taskName,
  type Override,
} from "./board";
import { BASES, BCS, DAY, SATURDAY, agent, at, pmr, tech, toAgent } from "./test-fixtures";
import { linkConnections } from "./window";
import type { PlannerContext, PlannerTask } from "./types";

// Données FICTIVES (bases DSO des classeurs, agents « Agent <id> »).

const AGENTS = [
  agent("ty1", "CPI", "FTY"),
  agent("ms-opi", "OPI", "FMS"),
  agent("ms-pa", "PA", "FMS"),
  agent("cr1", "CPI", "FCR"),
  agent("ms-n", "SPI", "FMS", [["22:00", "06:00"]]),
];
const ctx = (tasks: PlannerTask[]): PlannerContext => ({
  tasks,
  agents: AGENTS,
  bases: BASES,
  bcs: BCS,
});

describe("rangées et axe", () => {
  it("par base (ordre reçu) puis poste PA, CPI, OPI, SPI, EXTRA", () => {
    const g = groupAgents(AGENTS, BASES);
    expect(g.map((x) => x.code)).toEqual(["FMS", "FTY", "FCR"]);
    expect(g[0]!.agents.map((a) => a.id)).toEqual(["ms-pa", "ms-opi", "ms-n"]);
  });

  it("axe 4 h → 24 h, étendu au service de nuit (6 h le lendemain)", () => {
    const b = dayBounds(DAY, AGENTS);
    expect(b.start).toBe(Date.parse(at("04:00")));
    expect(b.end - b.midnight).toBe(30 * 3600_000);
    expect(hourTicks(b)[0]).toEqual({ at: b.start, label: "04h" });
    const day = dayBounds(DAY, [AGENTS[0]!]);
    expect(day.end - day.midnight).toBe(24 * 3600_000);
  });

  it("changement d'heure (25 oct. 2026, jour de 25 h) : bornes en heure de Bruxelles", () => {
    const D = "2026-10-25";
    const b = dayBounds(D, [agent("x", "CPI", "FMS", [["06:00", "14:00"]], D)]);
    expect(b.start).toBe(Date.parse(at("04:00", D)));
    expect(b.end).toBe(Date.parse(at("00:00", "2026-10-26")));
    expect(b.end - b.midnight).toBe(25 * 3600_000);
    const night = dayBounds(D, [agent("n", "SPI", "FMS", [["22:00", "09:00"]], D)]);
    expect(night.end).toBe(Date.parse(at("08:00", "2026-10-26")));
  });
});

describe("blocs", () => {
  it("plusieurs PMR du même train = un bloc ; chevauchement = autre piste", () => {
    const tasks = linkConnections([
      pmr("a", { time: "09:00", train: "1925" }),
      pmr("b", { time: "09:00", train: "1925", type: "MR" }),
      pmr("c", { time: "09:05", train: "1930" }),
    ]);
    const { blocks, lanes } = rowBlocks(tasks);
    expect(blocks).toHaveLength(2);
    expect(blockLabel(blocks[0]!.tasks)).toBe("2 PMR");
    expect(blocks[1]!.lane).toBe(1);
    expect(lanes).toBe(2);
    expect(blockLabel([pmr("d", { time: "09:00", type: "CRF" })])).toBe("1CRF");
    expect(blockLabel([tech("e", "08:00", "08:15", "Mons")])).toBe("EDF e");
  });
});

describe("compteurs et conflits", () => {
  it("à attribuer, conflits (refus), couverture des PMR", () => {
    const ok = pmr("ok", { time: "08:00", assignee: toAgent("ms-pa"), status: "attribuee" });
    const bad = pmr("bad", {
      time: "08:00",
      station: "Mons",
      train: "77",
      assignee: toAgent("cr1"),
      status: "attribuee",
    });
    const todo = pmr("todo", { time: "11:00" });
    const cancelled = pmr("x", { time: "12:00", status: "annulee" });
    const c = ctx([ok, bad, todo, cancelled]);
    const conflicts = conflictsOf(c);
    expect([...conflicts.keys()]).toEqual(["bad"]);
    expect(boardCounters(c, conflicts)).toEqual({
      toAssign: 1,
      conflicts: 1,
      coverage: 67,
      pmr: 3,
    });
  });

  it("tâches liées par correspondance attribuées ensemble", () => {
    const d = "2026-10-15-0007";
    const tasks = linkConnections([
      pmr("out", { time: "10:00", dir: "OUT", dossier: d }),
      pmr("in", { time: "10:20", dir: "IN", dossier: d }),
      pmr("solo", { time: "11:00" }),
    ]);
    expect(linkedIds("in", tasks).sort()).toEqual(["in", "out"]);
    expect(linkedIds("solo", tasks)).toEqual(["solo"]);
  });
});

describe("glisser-déposer", () => {
  it("agent valide ok ; hors zone refusé ; occupé = proposition d'un autre agent", () => {
    const busy = pmr("busy", {
      time: "09:00",
      train: "1",
      assignee: toAgent("ms-pa"),
      status: "attribuee",
    });
    const t = pmr("t", { time: "09:05", train: "2" });
    const c = ctx([busy, t]);
    expect(dropVerdict(["t"], { kind: "agent", agentId: "ms-opi" }, c).level).toBe("ok");
    const far = dropVerdict(["t"], { kind: "agent", agentId: "cr1" }, c);
    expect(far.level).toBe("block");
    expect(isBusyRefusal(far)).toBe(false);
    const occ = dropVerdict(["t"], { kind: "agent", agentId: "ms-pa" }, c);
    expect(occ.level).toBe("block");
    expect(isBusyRefusal(occ)).toBe(true);
    expect(dropVerdict(["t"], { kind: "taxi" }, c).level).toBe("ok");
  });

  it("plusieurs tâches déposées : contrôle cumulé (B-CS 3 voyageurs par heure, chevauchements)", () => {
    const n = (id: string, time: string) => pmr(id, { time, station: "Nivelles", train: `N${id}` });
    const tasks = [n("a", "08:00"), n("b", "08:10"), n("c", "08:20"), n("d", "08:30")];
    const c = ctx(tasks);
    // Chacune seule passe ; ensemble, la quatrième dépasse la limite.
    for (const t of tasks)
      expect(dropVerdict([t.id], { kind: "bcs", station: "Nivelles" }, c).level).toBe("ok");
    const all = dropVerdict(["a", "b", "c", "d"], { kind: "bcs", station: "nivelles" }, c);
    expect(all.level).toBe("block");
    expect(all.reasons[0]).toMatch(/^Guichet B-CS de Nivelles complet : 3\/3/);
    // Deux trains différents qui se chevauchent sur le même agent.
    const two = [pmr("x", { time: "09:00", train: "1" }), pmr("y", { time: "09:05", train: "2" })];
    expect(dropVerdict(["x", "y"], { kind: "agent", agentId: "ms-opi" }, ctx(two)).level).toBe(
      "block",
    );
    // Guichet d'une autre gare.
    expect(dropVerdict(["a"], { kind: "bcs", station: "Tamines" }, c).reasons).toEqual([
      "Ce guichet est à Tamines",
    ]);
  });
});

describe("tâches des jours voisins", () => {
  it("compteurs par jour de planification (veille au soir et nuit suivante non comptées)", () => {
    const todo = pmr("todo", { time: "11:00" });
    const nextNight = pmr("nn", { time: "03:00", day: "2026-10-16" });
    const prevEve = pmr("pe", {
      time: "21:00",
      day: "2026-10-14",
      assignee: toAgent("ms-pa"),
      status: "attribuee",
    });
    const c = ctx([todo, nextNight, prevEve]);
    expect(boardCounters(c, conflictsOf(c), DAY)).toEqual({
      toAssign: 1,
      conflicts: 0,
      coverage: 0,
      pmr: 1,
    });
    expect(boardCounters(c, conflictsOf(c)).toAssign).toBe(2);
  });
});

describe("attributions optimistes", () => {
  it("nouvel objet pour la tâche touchée, mêmes objets ailleurs ; oubli quand le serveur rattrape", () => {
    const a = pmr("a", { time: "08:00" });
    const b = pmr("b", { time: "09:00" });
    const o = new Map<string, Override>([
      ["a", { assignee: toAgent("ms-pa"), updated: "2026-10-15 08:00:00.000Z" }],
    ]);
    const out = applyOverrides([a, b], o);
    expect(out[0]).not.toBe(a);
    expect(out[0]!.assignee).toEqual(toAgent("ms-pa"));
    expect(out[0]!.status).toBe("attribuee");
    expect(out[1]).toBe(b);
    expect(settledOverrides(o, () => "2026-10-15 07:59:00.000Z")).toEqual([]);
    expect(settledOverrides(o, () => "2026-10-15 08:00:00.000Z")).toEqual(["a"]);
  });
});

describe("« À attribuer »", () => {
  it("triées par heure ; filtres source, zone, gare", () => {
    const tasks = [
      pmr("b", { time: "10:00", station: "Tournai" }),
      { ...pmr("a", { time: "09:00", station: "Saint-Ghislain" }), source: "dicos_attente" },
      pmr("c", { time: "11:00", assignee: toAgent("ms-pa"), status: "attribuee" }),
    ];
    const z = stationZones(BASES);
    expect(
      filterTodo(tasks, { source: "toutes", zone: "", station: "" }, z).map((t) => t.id),
    ).toEqual(["a", "b"]);
    expect(
      filterTodo(tasks, { source: "attente", zone: "", station: "" }, z).map((t) => t.id),
    ).toEqual(["a"]);
    expect(
      filterTodo(tasks, { source: "acceptees", zone: "FTY", station: "" }, z).map((t) => t.id),
    ).toEqual(["b"]);
    expect(
      filterTodo(tasks, { source: "toutes", zone: "", station: "saint ghislain" }, z).map(
        (t) => t.id,
      ),
    ).toEqual(["a"]);
  });

  it("recherche d'agent par nom ou n° de train de sa journée", () => {
    const t = pmr("t", { time: "09:00", train: "1925", assignee: toAgent("ms-pa") });
    expect(agentMatches(AGENTS[2]!, [t], "1925")).toBe(true);
    expect(agentMatches(AGENTS[2]!, [t], "agent ms-pa")).toBe(true);
    expect(agentMatches(AGENTS[0]!, [t], "1925")).toBe(false);
  });

  it("nom accessible complet", () => {
    expect(
      taskName(
        linkConnections([
          {
            ...pmr("t", {
              time: "09:50",
              dir: "OUT",
              type: "MR",
              train: "3418",
              station: "Saint-Ghislain",
            }),
            source: "dicos_attente",
          },
        ])[0]!,
      ),
    ).toBe("1MR OUT, train 3418, à Saint-Ghislain, 09h45-10h05, en attente DICOS");
  });
});

describe("guichets B-CS", () => {
  it("horaire de semaine ou de week-end", () => {
    expect(bcsOpen(BCS[0]!, DAY)?.label).toBe("07h15–14h35");
    expect(bcsOpen(BCS[0]!, SATURDAY)?.label).toBe("08h15–15h35");
    expect(bcsOpen(BCS[1]!, SATURDAY)).toBeNull();
  });
});
