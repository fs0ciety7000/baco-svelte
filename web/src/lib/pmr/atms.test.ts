import { describe, expect, it } from "vitest";

import { mapAtmsTrain } from "./atms";

// Structure d'une réponse ATMS `GET /api/v1/trains/{n°}/{jour}` (points réduits, valeurs d'exemple).
const sample = {
  trains: [{ trainNumber: 3804, label: "IC3804", departureDay: "2026-10-09" }],
  itineraryPoints: [
    {
      ptcarSymbolicName: "FMS",
      ptcarName: "MONS",
      orderNumber: 1,
      plannedFullArrivalTime: null,
      plannedFullDepartureTime: "2026-10-09T08:57:00",
    },
    {
      ptcarSymbolicName: "FTM",
      ptcarName: "TAMINES",
      orderNumber: 3,
      plannedFullArrivalTime: "2026-10-09T08:25:00",
      plannedFullDepartureTime: "2026-10-09T08:33:00",
    },
    {
      ptcarSymbolicName: "YNORD",
      ptcarName: "Y.NORD",
      orderNumber: 2,
      plannedFullArrivalTime: "2026-10-09T09:02:00",
      plannedFullDepartureTime: "2026-10-09T09:02:00",
    },
    {
      ptcarSymbolicName: "GLI",
      ptcarName: "LA LOUV-G.I.",
      orderNumber: 9,
      plannedFullArrivalTime: "2026-10-09T09:37:00",
      plannedFullDepartureTime: null,
    },
  ],
};

describe("horaires ATMS", () => {
  it("temps d'arrêt prévu par point, origine et terminus", () => {
    const { label, stops } = mapAtmsTrain(sample);
    expect(label).toBe("IC3804");
    expect(stops.map((s) => [s.abbr, s.dwell, s.position])).toEqual([
      ["FMS", 0, "origin"],
      ["YNORD", 0, "stop"],
      ["FTM", 480, "stop"], // 08:25 → 08:33 = 8 min
      ["GLI", 0, "terminus"],
    ]);
    expect(stops[2]).toMatchObject({ arr: "08:25", dep: "08:33" });
  });
  it("refuse une réponse sans itinéraire", () => {
    expect(() => mapAtmsTrain({ success: true })).toThrow();
  });
});
