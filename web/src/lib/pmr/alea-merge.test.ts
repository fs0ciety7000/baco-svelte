import { describe, expect, it } from "vitest";

import { aleaDecision, mergeAleaBlocks, type AleaGroup } from "./model";

const block = (over: Partial<AleaGroup>): AleaGroup => ({
  key: "2026-10-10|3804|Mons|IN",
  day: "2026-10-10",
  train: "3804",
  station: "Mons",
  time: "08:00",
  io: "IN",
  lines: [],
  dossiers: [],
  total: 0,
  unit: "PMR",
  rule: { kind: "pmr", full: 0, light: 1, unknown: 0 },
  ...over,
});

describe("export ALEA commun", () => {
  const pmr = block({
    lines: ["Embarquement d'une personne à mobilité réduite"],
    dossiers: [{ ref: "A", count: 1 }],
    total: 1,
  });
  const group = block({
    lines: ["Embarquement d'un groupe de 30 personnes dont 26 enfants"],
    dossiers: [{ ref: "G", count: 30 }],
    total: 30,
    unit: "personnes",
    rule: { kind: "group", children: 26, seniors: 0, total: 30 },
  });
  const other = block({ key: "2026-10-10|3804|Ath|OUT", station: "Ath", io: "OUT", time: "09:00" });

  it("fusionne PMR et groupes du même train, gare et sens", () => {
    const out = mergeAleaBlocks([pmr, other], [group]);
    expect(out).toHaveLength(2);
    const m = out[0]!;
    expect(m.lines).toEqual([...pmr.lines, ...group.lines]);
    expect(m.parts).toEqual({ pmr: pmr.key, groupe: group.key });
    expect(m.totalLabel).toBe("1 PMR + 30 personnes");
    expect(m.dossiers[1]).toEqual({ ref: "G", count: 30, unit: "personnes" });
    expect(out[1]!.parts).toEqual({ pmr: other.key });
  });

  it("la règle la plus exigeante décide", () => {
    const m = mergeAleaBlocks([pmr], [group])[0]!;
    const d = aleaDecision(m.rule, { seconds: 60, position: "stop" });
    expect(d.status).toBe("obligatoire");
    expect(d.reason).toContain("PMR :");
    expect(d.reason).toContain("Groupes :");
    expect(aleaDecision(m.rule, { seconds: 400, position: "stop" }).status).toBe("non");
  });
});
