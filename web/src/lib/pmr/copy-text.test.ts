import { describe, expect, it } from "vitest";

import {
  aleaDecision,
  aleaGroupBlocks,
  aleaGroupLine,
  aleaGroups,
  assistCopyText,
  numberFr,
  stationKey,
} from "./model";

describe("libellé à copier", () => {
  it("nombre en toutes lettres (genré)", () => {
    expect(numberFr(1)).toBe("un");
    expect(numberFr(1, true)).toBe("une");
    expect(numberFr(3)).toBe("trois");
    expect(numberFr(21, true)).toBe("vingt et une");
    expect(numberFr(42)).toBe("quarante-deux");
  });
  it("chaise roulante / non-voyant, embarquement / débarquement", () => {
    expect(assistCopyText({ direction: "depart", pax: 1, pmrType: "CRE" })).toBe(
      "Embarquement d'une chaise roulante",
    );
    expect(assistCopyText({ direction: "arrivee", pax: 2, pmrType: "CRF" })).toBe(
      "Débarquement de deux chaises roulantes",
    );
    expect(assistCopyText({ direction: "depart", pax: 1, pmrType: "NV" })).toBe(
      "Embarquement d'un non-voyant",
    );
    expect(assistCopyText({ direction: "arrivee", pax: 3, pmrType: "NV" })).toBe(
      "Débarquement de trois non-voyants",
    );
    expect(assistCopyText({ direction: "depart", pax: 1, pmrType: "DCO" })).toBe(
      "Embarquement d'une personne avec des difficultés d'orientation",
    );
  });
});

describe("export ALEA", () => {
  it("un bloc par train, gare et sens ; dossiers additionnés par type", () => {
    const base = { day: "2026-10-09", train: "3825", time: "08:00" };
    const groups = aleaGroups([
      { ...base, station: "MONS", io: "OUT", pax: 3, pmrType: "NV", dossier: "2026-10-09-0001" },
      { ...base, station: "MONS", io: "OUT", pax: 1, pmrType: "CRF", dossier: "2026-10-09-0002" },
      { ...base, station: "MONS", io: "OUT", pax: 1, pmrType: "NV", dossier: "2026-10-09-0003" },
      { ...base, station: "MONS", io: "IN", pax: 2, pmrType: "MR", dossier: "2026-10-09-0004" },
      { ...base, station: "LA LOUVIÈRE-SUD", time: "08:20", io: "IN", pax: 1, pmrType: "MR" },
    ]);
    expect(groups.map((g) => [g.station, g.io, g.lines, g.total, g.dossiers.length])).toEqual([
      ["MONS", "IN", ["Embarquement de deux mobilités réduites"], 2, 1],
      [
        "MONS",
        "OUT",
        ["Débarquement d'une chaise roulante fixe", "Débarquement de quatre non-voyants"],
        5,
        3,
      ],
      ["LA LOUVIÈRE-SUD", "IN", ["Embarquement d'une mobilité réduite"], 1, 1],
    ]);
  });
});

describe("export ALEA des groupes", () => {
  it("formule avec et sans enfants, un ou plusieurs groupes", () => {
    expect(aleaGroupLine("Embarquement", 53, 50)).toBe(
      "Embarquement d'un groupe de 53 personnes dont 50 enfants",
    );
    expect(aleaGroupLine("Débarquement", 22, 0)).toBe("Débarquement d'un groupe de 22 personnes");
    expect(aleaGroupLine("Embarquement", 2, 1)).toBe(
      "Embarquement d'un groupe de 2 personnes dont 1 enfant",
    );
    expect(aleaGroupLine("Embarquement", 52, 22, 2)).toBe(
      "Embarquement de 2 groupes, 52 personnes dont 22 enfants",
    );
  });
  it("groupes additionnés par train, gare et sens", () => {
    const base = { day: "2026-10-09", train: "4879", time: "08:27" };
    const blocks = aleaGroupBlocks([
      { ...base, station: "MONS", io: "IN", total: 27, children: 22, dossier: "A" },
      { ...base, station: "MONS", io: "IN", total: 25, children: 0, dossier: "B" },
      { ...base, station: "CAMBRON-CASTEAU", time: "08:45", io: "OUT", total: 27, children: 22 },
    ]);
    expect(blocks.map((b) => [b.station, b.lines, b.total])).toEqual([
      ["MONS", ["Embarquement de 2 groupes, 52 personnes dont 22 enfants"], 52],
      ["CAMBRON-CASTEAU", ["Débarquement d'un groupe de 27 personnes dont 22 enfants"], 27],
    ]);
  });
});

describe("ALEA obligatoire (logigrammes)", () => {
  const stop = (seconds: number) => ({ seconds, position: "stop" as const });
  const pmr = (full: number, light: number, unknown = 0) => ({
    kind: "pmr" as const,
    full,
    light,
    unknown,
  });
  const grp = (children: number, seniors: number, total: number) => ({
    kind: "group" as const,
    children,
    seniors,
    total,
  });
  it("PMR", () => {
    expect(aleaDecision(pmr(1, 0), stop(300)).status).toBe("non"); // arrêt ≥ 5 min
    expect(aleaDecision(pmr(1, 0), stop(60)).status).toBe("obligatoire"); // PMR complète
    expect(aleaDecision(pmr(0, 3), stop(60)).status).toBe("non"); // légère, moins de 4
    expect(aleaDecision(pmr(0, 4), stop(60)).status).toBe("obligatoire"); // 4 × 30 s = 2 min > 1 min
    expect(aleaDecision(pmr(0, 4), stop(180)).status).toBe("non"); // 2 min < 3 min
    expect(aleaDecision(pmr(0, 0, 2), stop(60)).status).toBe("verifier"); // type d'assistance inconnu
    expect(aleaDecision(pmr(1, 0), { seconds: null, position: "unknown" }).status).toBe("verifier");
    expect(aleaDecision(pmr(1, 0), { seconds: 0, position: "terminus" }).status).toBe("verifier");
  });
  it("groupes", () => {
    expect(aleaDecision(grp(30, 0, 35), stop(300)).status).toBe("non");
    expect(aleaDecision(grp(25, 0, 30), stop(60)).status).toBe("obligatoire");
    expect(aleaDecision(grp(0, 25, 30), stop(60)).status).toBe("obligatoire");
    expect(aleaDecision(grp(10, 10, 75), stop(60)).status).toBe("obligatoire");
    expect(aleaDecision(grp(24, 24, 74), stop(60)).status).toBe("non");
  });
  it("noms de gare DICOS / iRail", () => {
    expect(stationKey("Flémalle-Haute")).toBe(stationKey("Flemalle-Haute"));
    expect(stationKey("LA LOUVIÈRE-SUD")).toBe("la louviere sud");
  });
});
