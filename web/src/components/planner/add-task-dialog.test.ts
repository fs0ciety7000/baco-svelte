import { describe, expect, it } from "vitest";

import { parseTaskLines } from "@/lib/planner";

import { parsedToInput } from "./add-task-dialog";

// Données FICTIVES.
const REFS = [
  { abbr: "FMS", names: ["Mons"] },
  { abbr: "FLV", names: ["La Louvière-Sud"] },
];

describe("ligne analysée → champs envoyés au serveur", () => {
  it("taxi : destination taxi transmise, aucun n° de train « TAXI »", () => {
    const r = parseTaskLines("2CRF 17H05 TAXI OUT à La Louvière-Sud venant de Mons", {
      day: "2026-10-15",
      stations: REFS,
    });
    const input = parsedToInput(r.tasks[0]!);
    expect(input).toMatchObject({
      station: "La Louvière-Sud",
      other_station: "Mons",
      train: "",
      assignee_kind: "taxi",
      assignee_label: "Taxi",
    });
  });

  it("train : pas de destination posée", () => {
    const r = parseTaskLines("1NV 08h00 906 IN de Mons à La Louvière-Sud", {
      day: "2026-10-15",
      stations: REFS,
    });
    const input = parsedToInput(r.tasks[0]!);
    expect(input.train).toBe("906");
    expect(input.assignee_kind).toBeUndefined();
  });
});
