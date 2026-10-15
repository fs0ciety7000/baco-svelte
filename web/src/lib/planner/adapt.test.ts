import { describe, expect, it } from "vitest";

import {
  adaptDay,
  baseCodeOf,
  findDuplicates,
  toEngineTask,
  type ServerDay,
  type ServerTask,
} from "./adapt";
import { checkAssign } from "./assign";
import { taskName } from "./board";
import { at, DAY } from "./test-fixtures";

// Données FICTIVES (aucun nom réel).

const serverTask = (o: Partial<ServerTask> & { id: string }): ServerTask => ({
  day: DAY,
  kind: "pmr_in",
  start: at("09:50"),
  end: at("09:50"),
  station: "Mons",
  stationKey: "mons",
  otherStation: "Tournai",
  train: "3418",
  pmrType: "MR",
  pax: 1,
  light: true,
  dossier: "",
  source: "dicos_mission",
  sourceKey: "",
  dicosStatus: "accepted",
  stationOk: "",
  assist: "",
  assigneeKind: "",
  assigneeAgent: "",
  assigneeLabel: "",
  status: "a_attribuer",
  linkKey: "",
  origin: "",
  label: "",
  note: "",
  dicosChanged: false,
  district: "DSO",
  updated: "2026-10-15 07:00:00.000Z",
  ...o,
});

const DAY_DATA: ServerDay = {
  day: DAY,
  bases: [
    {
      id: "b1",
      code: "FMS",
      name: "Mons",
      district: "DSO",
      zone: "FMS",
      posts: ["PA", "CPI"],
      travel: [{ station: "Saint-Ghislain", minutes: 25 }],
      covers: ["FTY"],
    },
    {
      id: "b2",
      code: "FCR",
      name: "Charleroi-Central",
      district: "DSO",
      zone: "FCR",
      posts: ["CPI"],
      travel: [{ station: "Nivelles", minutes: 40 }],
      covers: [],
    },
  ],
  agents: [
    {
      id: "agentmons000001",
      name: "Agent Test A.",
      post: "OPI",
      base: "Mons",
      district: "DSO",
      shifts: [
        {
          id: "s1",
          day: DAY,
          start: at("06:00"),
          end: at("14:00"),
          code: "OPI 6-14",
          section: "OPI Mons",
          kind: "am",
          post: "OPI",
          base: "Mons",
          district: "DSO",
        },
      ],
    },
    {
      id: "agentcrl0000001",
      name: "Agent Test B.",
      post: "",
      base: "CHARLEROI CENTRAL",
      district: "DSO",
      shifts: [
        {
          id: "s2",
          day: DAY,
          start: at("06:00"),
          end: at("14:00"),
          code: "CPI_AM",
          section: "CPI CHARLEROI",
          kind: "am",
          post: "CPI",
          base: "Charleroi-Central",
          district: "DSO",
        },
      ],
    },
  ],
  tasks: [
    serverTask({ id: "t1" }),
    serverTask({
      id: "t2",
      kind: "technique",
      start: at("08:00"),
      end: at("08:20"),
      label: "EDF 1707",
      source: "modele",
      pmrType: "",
    }),
  ],
  templates: [],
  bcs: [
    {
      id: "c1",
      station: "Nivelles",
      weekdayHours: "07:15-14:35",
      weekendHours: "",
      kind: "PMR only",
      perHour: 3,
      lightOnly: true,
      base: "FCR",
    },
  ],
};

describe("adaptDay", () => {
  it("heure du train = début d'une PMR DICOS ; fenêtre calculée (light IN T−15 → T+5)", () => {
    const a = adaptDay(DAY_DATA);
    const t = a.byId.get("t1")!;
    expect(t.trainAt).toBe(at("09:50"));
    expect(t.start).toBe(new Date(Date.parse(at("09:50")) - 15 * 60_000).toISOString());
    expect(t.end).toBe(new Date(Date.parse(at("09:50")) + 5 * 60_000).toISOString());
    expect(t.source).toBe("dicos");
    // Tâche technique : heures inchangées, pas d'heure de train.
    const tech = a.byId.get("t2")!;
    expect(tech.trainAt).toBeUndefined();
    expect(tech.start).toBe(at("08:00"));
    // Fiche serveur gardée (verrou optimiste).
    expect(a.server.get("t1")!.updated).toBe("2026-10-15 07:00:00.000Z");
  });

  it("base de l'agent : nom → code, poste repris de la prestation", () => {
    const a = adaptDay(DAY_DATA);
    expect(a.ctx.agents[0]).toMatchObject({ base: "FMS", post: "OPI" });
    expect(a.ctx.agents[1]).toMatchObject({ base: "FCR", post: "CPI" });
    expect(a.ctx.bcs[0]).toMatchObject({ station: "Nivelles", base: "FCR", perHour: 3 });
  });

  it("le moteur refuse Charleroi → Mons et accepte l'agent de Mons", () => {
    const a = adaptDay(DAY_DATA);
    const t = a.byId.get("t1")!;
    expect(checkAssign(t, { kind: "agent", agentId: "agentmons000001" }, a.ctx).level).toBe("ok");
    const r = checkAssign(t, { kind: "agent", agentId: "agentcrl0000001" }, a.ctx);
    expect(r.level).toBe("block");
    expect(r.reasons.join(" ")).toContain("Hors zone");
  });

  it("nouveaux objets à chaque appel (caches du moteur par objet)", () => {
    expect(adaptDay(DAY_DATA).ctx.tasks).not.toBe(adaptDay(DAY_DATA).ctx.tasks);
  });
});

describe("toEngineTask", () => {
  it("attribution, statut DICOS, sources", () => {
    const t = toEngineTask(
      serverTask({
        id: "x",
        source: "dicos_pending",
        dicosStatus: "cancelled",
        assigneeKind: "agent",
        assigneeAgent: "agentmons000001",
        status: "annulee",
      }),
    );
    expect(t).toMatchObject({
      source: "dicos_attente",
      dicosStatus: "cancelled",
      status: "annulee",
      assignee: { kind: "agent", agentId: "agentmons000001" },
    });
    const taxi = toEngineTask(serverTask({ id: "y", assigneeKind: "taxi", assigneeLabel: "Taxi" }));
    expect(taxi.assignee).toEqual({ kind: "taxi", label: "Taxi" });
  });

  it("« Modifiée par DICOS » transmis au moteur (et au nom accessible)", () => {
    expect(toEngineTask(serverTask({ id: "c", dicosChanged: true })).dicosChanged).toBe(true);
    expect(toEngineTask(serverTask({ id: "d" })).dicosChanged).toBeUndefined();
    expect(taskName(toEngineTask(serverTask({ id: "e", dicosChanged: true })))).toMatch(
      /modifiée par DICOS/,
    );
  });

  it("PMR saisie avec une vraie fenêtre : heures gardées, pas d'heure de train", () => {
    const t = toEngineTask(serverTask({ id: "z", start: at("10:00"), end: at("10:20") }));
    expect(t.trainAt).toBeUndefined();
  });
});

describe("baseCodeOf", () => {
  it("code ou nom tolérant", () => {
    expect(baseCodeOf("fms", DAY_DATA.bases)).toBe("FMS");
    expect(baseCodeOf("charleroi central", DAY_DATA.bases)).toBe("FCR");
    expect(baseCodeOf("Namur", DAY_DATA.bases)).toBe("");
  });
});

describe("findDuplicates", () => {
  it("saisie manuelle = même dossier, train, sens et gare qu'une tâche DICOS", () => {
    const d = "2026-10-15-0042";
    const pairs = findDuplicates([
      serverTask({ id: "dicos", dossier: d }),
      serverTask({ id: "manual", dossier: d, source: "manuel", station: "MONS", stationKey: "" }),
      serverTask({ id: "other", dossier: d, source: "manuel", kind: "pmr_out" }),
      serverTask({ id: "nodossier", source: "manuel" }),
    ]);
    expect(pairs).toEqual([{ manualId: "manual", dicosId: "dicos" }]);
  });
});
