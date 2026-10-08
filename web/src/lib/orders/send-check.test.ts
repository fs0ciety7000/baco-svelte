import { describe, expect, it } from "vitest";

import { busDraftSchema, checkBusForSend, checkTaxiForSend, taxiDraftSchema } from "./schemas";

describe("contrôles avant envoi : adresse e-mail facultative (retour du 9 oct. 2026)", () => {
  it("bon bus complet sans adresse e-mail : envoi possible (PDF seul)", () => {
    const d = busDraftSchema.parse({
      reason: "Travaux",
      order_date: "2026-10-09",
      origin: "Mons",
      destination: "Ath",
      company: "abcdefghijklmno",
      buses: [{ planned: "08:00", actual: "08:05" }],
    });
    expect(d.buses[0]?.actual).toBe("08:05");
    expect(checkBusForSend(d, { companyEmail: "" })).toEqual([]);
  });

  it("bon bus sans société : toujours bloquant", () => {
    const d = busDraftSchema.parse({
      reason: "x",
      order_date: "2026-10-09",
      origin: "A",
      destination: "B",
    });
    expect(checkBusForSend(d, { companyEmail: "" }).map((m) => m.field)).toContain("company");
  });

  it("taxi avec société sans adresse : plus bloquant", () => {
    const d = taxiDraftSchema.parse({
      trip_day: "2026-10-09",
      trip_time: "08:00",
      from_station: "Mons",
      to_station: "Ath",
      taxi_company: "abcdefghijklmno",
    });
    expect(checkTaxiForSend(d, { companyEmail: "" })).toEqual([]);
  });
});
