import { describe, expect, it } from "vitest";
import { BASES, BCS, SATURDAY, agent, at, pmr, tech, toAgent } from "./test-fixtures";
import { autoAssign, bcsLoad, checkAssign, suggestAgents } from "./assign";
import { linkConnections } from "./window";
import type { PlannerContext, PlannerTask } from "./types";

const AGENTS = [
  agent("pa1", "PA", "FMS"),
  agent("opi1", "OPI", "FMS"),
  agent("cpi1", "CPI", "FMS", [["14:00", "22:00"]]),
  agent("crOpi", "OPI", "FCR"),
  agent("tyCpi", "CPI", "FTY"),
];
const ctx = (tasks: PlannerTask[] = [], agents = AGENTS): PlannerContext => ({
  tasks,
  agents,
  bases: BASES,
  bcs: BCS,
});
const BCS_TARGET = { kind: "bcs" as const };

describe("checkAssign — agent", () => {
  it("ok dans le service, à la gare de base", () => {
    expect(checkAssign(pmr("a", { time: "08:00" }), toAgent("pa1"), ctx())).toEqual({
      level: "ok",
      reasons: [],
    });
  });

  it("hors service (block) ; déborde du service (warn) ; pas de service", () => {
    expect(checkAssign(pmr("a", { time: "15:00" }), toAgent("pa1"), ctx())).toEqual({
      level: "block",
      reasons: ["Hors service (06h00-14h00)"],
    });
    expect(checkAssign(pmr("b", { time: "06:10" }), toAgent("pa1"), ctx())).toEqual({
      level: "warn",
      reasons: ["Déborde du service (06h00-14h00)"],
    });
    const idle = { ...AGENTS[0]!, id: "idle", shifts: [] };
    expect(
      checkAssign(pmr("c", { time: "08:00" }), toAgent("idle"), ctx([], [idle])).reasons,
    ).toEqual(["Pas de service ce jour"]);
  });

  it("hors zone : Charleroi ne couvre pas Mons", () => {
    const r = checkAssign(pmr("a", { time: "08:00" }), toAgent("crOpi"), ctx());
    expect(r.level).toBe("block");
    expect(r.reasons).toContain("Hors zone : Charleroi-Central ne couvre pas Mons");
  });

  it("chevauchement avec un autre train : refusé ; même train même gare : permis", () => {
    const busy = pmr("t906", { time: "07:16", train: "906", assignee: toAgent("pa1") }); // 07:01-07:21
    const other = pmr("t907", { time: "07:20", train: "907" });
    expect(checkAssign(other, toAgent("pa1"), ctx([busy]))).toEqual({
      level: "block",
      reasons: ["Occupé 07h01-07h21 (train 906)"],
    });
    const same = pmr("t906b", { time: "07:16", train: "906", type: "CRF" });
    expect(checkAssign(same, toAgent("pa1"), ctx([busy])).level).toBe("ok");
    const tec = tech("edf", "07:00", "07:15", "Mons", {
      assignee: toAgent("opi1"),
      label: "EDF RE1707",
    });
    expect(checkAssign(other, toAgent("opi1"), ctx([tec])).reasons).toEqual([
      "Occupé 07h00-07h15 (EDF RE1707)",
    ]);
  });

  it("la tâche elle-même (réattribution) et sa correspondance ne sont pas des conflits", () => {
    const [out, inn] = linkConnections([
      pmr("o", {
        time: "08:00",
        dir: "OUT",
        dossier: "2026-10-15-0001",
        train: "E1",
        assignee: toAgent("pa1"),
      }),
      pmr("i", { time: "08:10", dir: "IN", dossier: "2026-10-15-0001", train: "E2" }),
    ]);
    expect(checkAssign(inn!, toAgent("pa1"), ctx([out!, inn!])).level).toBe("ok");
    expect(checkAssign(out!, toAgent("pa1"), ctx([out!])).level).toBe("ok");
  });

  it("trajet impossible depuis la tâche précédente ou depuis la base au début du service", () => {
    const m = pmr("m", { time: "08:00", assignee: toAgent("opi1") }); // 07:45-08:05 à Mons
    const ath = pmr("a", { time: "08:30", station: "Ath", train: "907" }); // 08:15
    expect(checkAssign(ath, toAgent("opi1"), ctx([m]))).toEqual({
      level: "block",
      reasons: ["Trajet de 50 min depuis Mons, impossible avant 08h55"],
    });
    const early = pmr("e", { time: "06:20", station: "Ath" }); // 06:05
    expect(checkAssign(early, toAgent("opi1"), ctx()).reasons).toEqual([
      "Trajet de 50 min depuis Mons, impossible avant 06h50",
    ]);
    const prevAth = pmr("pa", { time: "08:00", station: "Tournai", assignee: toAgent("tyCpi") }); // fin 08:05
    const next = pmr("n", { time: "09:00", station: "Mouscron", train: "908" }); // 08:45 : 35 min OK
    expect(checkAssign(next, toAgent("tyCpi"), ctx([prevAth])).level).toBe("ok");
    const tooSoon = pmr("s", { time: "08:50", station: "Mouscron", train: "909" }); // 08:35 < 08:40
    expect(checkAssign(tooSoon, toAgent("tyCpi"), ctx([prevAth])).reasons).toEqual([
      "Trajet de 35 min depuis Tournai, impossible avant 08h40",
    ]);
  });

  it("trajet impossible vers la tâche suivante", () => {
    const later = pmr("l", { time: "09:15", station: "Ath", assignee: toAgent("opi1") }); // 09:00
    const now = pmr("n", { time: "08:40", train: "907" }); // Mons 08:25-08:45, + 50 = 09:35
    expect(checkAssign(now, toAgent("opi1"), ctx([later])).reasons).toEqual([
      "Trajet de 50 min vers Ath : la tâche de 09h00 ne serait plus tenable",
    ]);
  });

  it("retour à la base après la fin du service : avertissement", () => {
    const t = pmr("a", { time: "13:15", station: "Ath" }); // fin 13:20 + 50
    expect(checkAssign(t, toAgent("opi1"), ctx())).toEqual({
      level: "warn",
      reasons: ["Retour à Mons vers 14h10, après la fin du service"],
    });
  });

  it("agent inconnu ; taxi et chef de bord toujours possibles ; annulée = avertissement", () => {
    expect(checkAssign(pmr("a", { time: "08:00" }), toAgent("zz"), ctx()).reasons).toEqual([
      "Agent inconnu",
    ]);
    const night = pmr("n", { time: "03:00", station: "Charleroi-Central" });
    expect(checkAssign(night, { kind: "taxi" }, ctx())).toEqual({ level: "ok", reasons: [] });
    expect(checkAssign(night, { kind: "cdb" }, ctx())).toEqual({ level: "ok", reasons: [] });
    const cancelled = pmr("c", { time: "15:00", dicosStatus: "Cancelled" });
    expect(checkAssign(cancelled, toAgent("crOpi"), ctx()).level).toBe("warn");
  });
});

describe("checkAssign — guichet B-CS", () => {
  const niv = (id: string, time: string, extra: Partial<Parameters<typeof pmr>[1]> = {}) =>
    pmr(id, { time, station: "Nivelles", train: `T${id}`, ...extra });

  it("ouvert, fermé à cette heure, fermé le week-end, jour férié = horaire du week-end", () => {
    expect(checkAssign(niv("a", "08:00"), BCS_TARGET, ctx()).level).toBe("ok");
    expect(checkAssign(niv("b", "07:00"), BCS_TARGET, ctx()).reasons).toEqual([
      "Guichet B-CS de Nivelles fermé à 07h00 (ouvert 07h15-14h35)",
    ]);
    expect(checkAssign(niv("c", "08:00", { day: SATURDAY }), BCS_TARGET, ctx()).level).toBe(
      "block",
    );
    expect(checkAssign(niv("d", "09:00", { day: SATURDAY }), BCS_TARGET, ctx()).level).toBe("ok");
    const tamines = pmr("e", { time: "09:00", station: "Tamines", day: SATURDAY });
    expect(checkAssign(tamines, BCS_TARGET, ctx()).reasons).toEqual([
      "Guichet B-CS de Tamines fermé le week-end et les jours fériés",
    ]);
    expect(checkAssign(niv("f", "08:00", { day: "2026-11-11" }), BCS_TARGET, ctx()).level).toBe(
      "block",
    );
  });

  it("guichet d'une autre gare refusé (libellé ou clé de gare)", () => {
    const t = niv("a", "08:00");
    expect(checkAssign(t, { kind: "bcs", label: "Tamines" }, ctx()).reasons).toEqual([
      "Ce guichet est à Tamines",
    ]);
    expect(checkAssign(t, { kind: "bcs", label: "tamines" }, ctx()).level).toBe("block");
    expect(checkAssign(t, { kind: "bcs", label: "Nivelles" }, ctx()).level).toBe("ok");
    expect(checkAssign(t, { kind: "bcs", label: "nivelles" }, ctx()).level).toBe("ok");
  });

  it("PMR light seulement, PMR seulement, gare sans guichet", () => {
    expect(checkAssign(niv("a", "08:00", { type: "CRF" }), BCS_TARGET, ctx()).reasons).toEqual([
      "Le guichet B-CS de Nivelles ne prend que des PMR light",
    ]);
    expect(checkAssign(tech("t", "08:00", "08:10", "Nivelles"), BCS_TARGET, ctx()).level).toBe(
      "block",
    );
    expect(checkAssign(pmr("m", { time: "08:00" }), BCS_TARGET, ctx()).reasons).toEqual([
      "Pas de guichet B-CS à Mons",
    ]);
  });

  it("3 PMR par heure civile de train, voyageurs comptés", () => {
    const placed = [
      niv("a", "08:05", { assignee: BCS_TARGET }),
      niv("b", "08:20", { assignee: BCS_TARGET, pax: 2 }),
      niv("x", "09:00", { assignee: BCS_TARGET }),
    ];
    expect(checkAssign(niv("c", "08:55"), BCS_TARGET, ctx(placed))).toEqual({
      level: "block",
      reasons: ["Guichet B-CS de Nivelles complet : 3/3 PMR entre 08h00 et 09h00"],
    });
    expect(checkAssign(niv("d", "09:30"), BCS_TARGET, ctx(placed)).level).toBe("ok");
    expect(bcsLoad(BCS[0]!, placed, at("08:30")).label).toBe("3/3 cette heure");
    expect(bcsLoad(BCS[0]!, placed, at("09:59"))).toMatchObject({ used: 1, limit: 3 });
  });

  it("une correspondance OUT + IN du même dossier compte pour 1", () => {
    const D = "2026-10-15-0009";
    const linked = linkConnections([
      niv("o", "08:10", { dir: "OUT", dossier: D, assignee: BCS_TARGET }),
      niv("i", "08:25", { dir: "IN", dossier: D }),
      niv("y", "08:30", { assignee: BCS_TARGET }),
    ]);
    const ok = checkAssign(linked[1]!, BCS_TARGET, ctx(linked));
    expect(ok.level).toBe("ok");
    const withIn = linked.map((t) => (t.id === "i" ? { ...t, assignee: BCS_TARGET } : t));
    expect(bcsLoad(BCS[0]!, withIn, at("08:00")).used).toBe(2);
    expect(checkAssign(niv("z", "08:40"), BCS_TARGET, ctx(withIn)).level).toBe("ok");
    const full = [...withIn, niv("z", "08:40", { assignee: BCS_TARGET })];
    expect(checkAssign(niv("w", "08:45"), BCS_TARGET, ctx(full)).level).toBe("block");
  });

  it("une correspondance à cheval sur deux heures compte dans l'heure du premier train", () => {
    const D = "2026-10-15-0010";
    const linked = linkConnections([
      niv("o", "08:50", { dir: "OUT", dossier: D, assignee: BCS_TARGET }),
      niv("i", "09:10", { dir: "IN", dossier: D, assignee: BCS_TARGET }),
    ]);
    expect(bcsLoad(BCS[0]!, linked, at("08:00")).used).toBe(1);
    expect(bcsLoad(BCS[0]!, linked, at("09:00")).used).toBe(0);
  });
});

describe("suggestAgents", () => {
  it("gare de base : PA d'abord, agents hors service ou hors zone exclus", () => {
    const s = suggestAgents(pmr("a", { time: "08:00" }), ctx());
    expect(s.map((x) => x.target.agentId)).toEqual(["pa1", "opi1", "tyCpi"]);
    expect(s[0]!.reason).toBe("Même gare, 0 trajet · poste préféré (PA) · charge 0 %");
    expect(s[0]!.score).toBeGreaterThan(s[1]!.score);
    expect(s[2]!.reason).toMatch(/^Trajet 50 min depuis Tournai/);
  });

  it("déjà sur place l'emporte ; trajet le plus court ensuite", () => {
    const there = pmr("p", { time: "07:30", station: "Ath", assignee: toAgent("opi1") });
    const s = suggestAgents(
      pmr("a", { time: "09:00", station: "Ath", train: "907" }),
      ctx([there]),
    );
    expect(s[0]!.target.agentId).toBe("opi1");
    expect(s[0]!.reason).toMatch(/^Libre, déjà sur place · poste préféré \(OPI\) · charge \d+ %$/);
    const fresh = suggestAgents(pmr("b", { time: "09:00", station: "Ath", train: "907" }), ctx());
    expect(fresh[0]!.target.agentId).toBe("tyCpi");
    expect(fresh[0]!.reason).toMatch(/^Trajet 40 min depuis Tournai/);
  });

  it("guichet B-CS proposé en premier quand il est permis", () => {
    const s = suggestAgents(pmr("n", { time: "08:00", station: "Nivelles" }), ctx());
    expect(s[0]).toMatchObject({
      target: { kind: "bcs" },
      reason: "Guichet B-CS ouvert · 0/3 cette heure",
    });
    expect(s[1]!.target.agentId).toBe("crOpi");
    const chair = suggestAgents(
      pmr("c", { time: "08:00", station: "Nivelles", type: "CRF" }),
      ctx(),
    );
    expect(chair[0]!.target.agentId).toBe("crOpi");
  });

  it("aucune proposition pour une tâche annulée ; limite", () => {
    expect(suggestAgents(pmr("x", { time: "08:00", status: "annulee" }), ctx())).toEqual([]);
    expect(suggestAgents(pmr("y", { time: "08:00" }), ctx(), 1)).toHaveLength(1);
  });
});

describe("autoAssign", () => {
  it("répartit sans conflit, garde les attributions, ignore les annulées, ne modifie rien", () => {
    const tasks = linkConnections([
      pmr("a", { time: "07:16", train: "906" }),
      pmr("b", { time: "07:20", train: "907" }),
      pmr("b2", { time: "07:20", train: "907", type: "CRF" }),
      pmr("kept", { time: "10:00", train: "910", assignee: toAgent("opi1") }),
      pmr("gone", { time: "11:00", dicosStatus: "Cancelled" }),
      pmr("o", { time: "12:00", dir: "OUT", dossier: "2026-10-15-0001", train: "E1" }),
      pmr("i", { time: "12:20", dir: "IN", dossier: "2026-10-15-0001", train: "E2" }),
    ]);
    const before = JSON.stringify(tasks);
    const { proposals, unassigned } = autoAssign(tasks, ctx(tasks));
    expect(JSON.stringify(tasks)).toBe(before);
    const who = Object.fromEntries(proposals.map((p) => [p.taskId, p.target.agentId]));
    expect(Object.keys(who).sort()).toEqual(["a", "b", "b2", "i", "o"]);
    expect(who.a).toBe("pa1");
    expect(who.b).toBe("opi1"); // pa1 occupée par le 906
    expect(who.b2).toBe(who.b); // même train, même gare
    expect(who.o).toBe(who.i); // correspondance
    expect(unassigned).toEqual([]);
    expect(proposals.find((p) => p.taskId === "b")!.reason).toMatch(/avec 1 tâche liée$/);
  });

  it("préfère l'agent d'une tâche liée déjà attribuée", () => {
    const tasks = linkConnections([
      pmr("o", {
        time: "09:00",
        dir: "OUT",
        dossier: "2026-10-15-0002",
        train: "E1",
        assignee: toAgent("opi1"),
      }),
      pmr("i", { time: "09:15", dir: "IN", dossier: "2026-10-15-0002", train: "E2" }),
    ]);
    expect(autoAssign(tasks, ctx(tasks)).proposals).toEqual([
      expect.objectContaining({
        taskId: "i",
        target: expect.objectContaining({ agentId: "opi1" }),
      }),
    ]);
  });

  it("guichet B-CS jusqu'à 3 par heure, fauteuil et surplus à un agent", () => {
    const tasks = ["08:00", "08:10", "08:20", "08:30"].map((t, k) =>
      pmr(`n${k}`, { time: t, station: "Nivelles", train: `N${k}` }),
    );
    tasks.push(pmr("chair", { time: "10:00", station: "Nivelles", type: "CRF", train: "N9" }));
    const { proposals } = autoAssign(tasks, ctx(tasks));
    const kinds = proposals.map((p) => `${p.taskId}:${p.target.kind}`);
    expect(kinds).toEqual(["n0:bcs", "n1:bcs", "n2:bcs", "n3:agent", "chair:agent"]);
  });

  it("aucun agent : non attribuée avec les raisons", () => {
    const tasks = [
      pmr("night", { time: "23:00", train: "999" }),
      pmr("far", { time: "08:00", station: "Arlon" }),
    ];
    const { proposals, unassigned } = autoAssign(tasks, ctx(tasks));
    expect(proposals).toEqual([]);
    const by = Object.fromEntries(unassigned.map((u) => [u.taskId, u.reasons]));
    expect(by.night![0]).toMatch(/^Hors service/);
    expect(by.night!.at(-1)).toBe("Prévoir un taxi ou le chef de bord");
    expect(by.far![0]).toBe("Aucun agent en service ne couvre Arlon");
  });

  it("tient compte des propositions précédentes du même passage (trajets)", () => {
    // Un seul agent : Ath à 08:15 puis Mons à 08:40 → impossible (50 min), la seconde reste à attribuer.
    const solo = [agent("o", "OPI", "FMS")];
    const tasks = [
      pmr("ath", { time: "08:15", station: "Ath", train: "1" }),
      pmr("mons", { time: "08:40", train: "2" }),
    ];
    const { proposals, unassigned } = autoAssign(tasks, ctx(tasks, solo));
    expect(proposals.map((p) => p.taskId)).toEqual(["ath"]);
    expect(unassigned[0]!.reasons[0]).toMatch(/^Trajet de 50 min depuis Ath/);
  });

  it("groupe réuni par un même train : aucune proposition refusée une fois toutes appliquées", () => {
    // Dossier A : OUT train E1 09h00 puis IN train E2 09h20 (correspondance) ; dossier B : IN train E2 09h20.
    const tasks = linkConnections([
      pmr("aOut", { time: "09:00", dir: "OUT", dossier: "2026-10-15-0011", train: "E1" }),
      pmr("aIn", { time: "09:20", dir: "IN", dossier: "2026-10-15-0011", train: "E2" }),
      pmr("bIn", { time: "09:20", dir: "IN", dossier: "2026-10-15-0012", train: "E2" }),
    ]);
    const res = autoAssign(tasks, ctx(tasks));
    const who = Object.fromEntries(res.proposals.map((p) => [p.taskId, p.target.agentId]));
    expect(Object.keys(who).sort()).toEqual(["aIn", "aOut", "bIn"]);
    expect(who.aIn).toBe(who.aOut);
    expect(who.bIn).not.toBe(who.aOut);
    const applied = tasks.map((t) => {
      const p = res.proposals.find((x) => x.taskId === t.id);
      return p ? { ...t, assignee: p.target } : t;
    });
    const after = ctx(applied);
    const refused = applied.filter(
      (t) => t.assignee && checkAssign(t, t.assignee, after).level === "block",
    );
    expect(refused.map((t) => t.id)).toEqual([]);
    // Un seul agent : la correspondance lui revient, l'autre dossier reste à attribuer (jamais « Occupé » après coup).
    const solo = autoAssign(tasks, ctx(tasks, [agent("o", "OPI", "FMS")]));
    expect(solo.proposals.map((p) => p.taskId).sort()).toEqual(["aIn", "aOut"]);
    expect(solo.unassigned.map((u) => u.taskId)).toEqual(["bIn"]);
    expect(solo.unassigned[0]!.reasons[0]).toMatch(/^Occupé/);
  });

  it("taxi : « TAXI » n'est pas un n° de train, deux taxis qui se chevauchent sont en conflit", () => {
    const t1 = pmr("x1", { time: "09:00", train: "TAXI", assignee: toAgent("pa1") });
    const t2 = pmr("x2", { time: "09:05", train: "TAXI" });
    const linked = linkConnections([t1, t2]);
    expect(linked.every((t) => !t.linkKey)).toBe(true);
    const r = checkAssign(linked[1]!, toAgent("pa1"), ctx(linked));
    expect(r.level).toBe("block");
    expect(r.reasons[0]).toMatch(/^Occupé/);
  });

  it("performance : 60 agents × 300 tâches en moins de 200 ms", () => {
    const stations = [
      "Mons",
      "Ath",
      "Saint-Ghislain",
      "La Louvière-Sud",
      "Tournai",
      "Leuze",
      "Mouscron",
      "Charleroi-Central",
      "Nivelles",
      "Luttre",
      "Braine-le-Comte",
      "Soignies",
    ];
    const posts = ["PA", "CPI", "OPI", "SPI", "EXTRA"] as const;
    const codes = ["FMS", "FTY", "FCR", "FBC"];
    const agents = Array.from({ length: 60 }, (_, k) =>
      agent(
        `a${k}`,
        posts[k % 5]!,
        codes[k % 4]!,
        k % 3 === 0
          ? [["06:00", "14:00"]]
          : k % 3 === 1
            ? [["14:00", "22:00"]]
            : [["22:00", "06:00"]],
      ),
    );
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const tasks = linkConnections(
      Array.from({ length: 300 }, (_, k) => {
        const minutes = 300 + Math.floor(rnd() * 1080);
        const time = `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
        return pmr(`t${k}`, {
          time,
          station: stations[Math.floor(rnd() * stations.length)]!,
          train: String(1000 + Math.floor(rnd() * 200)),
          type: rnd() < 0.3 ? "CRF" : "NV",
          dir: rnd() < 0.5 ? "IN" : "OUT",
          ...(rnd() < 0.2 ? { dossier: `2026-10-15-${String(k % 40).padStart(4, "0")}` } : {}),
        });
      }),
    );
    const c = ctx(tasks, agents);
    const t0 = performance.now();
    const res = autoAssign(tasks, c);
    const ms = performance.now() - t0;
    expect(res.proposals.length + res.unassigned.length).toBe(300);
    expect(ms).toBeLessThan(200);
    // Chaque proposition retenue reste acceptable une fois toutes appliquées (aucun refus).
    const applied = tasks.map((t) => {
      const p = res.proposals.find((x) => x.taskId === t.id);
      return p ? { ...t, assignee: p.target } : t;
    });
    const after = ctx(applied, agents);
    const refused = applied.filter(
      (t) => t.assignee && checkAssign(t, t.assignee, after).level === "block",
    );
    expect(refused.map((t) => t.id)).toEqual([]);
  });
});
