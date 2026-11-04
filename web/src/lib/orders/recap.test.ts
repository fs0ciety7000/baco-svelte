import { describe, expect, it } from "vitest";

import type { BillingBus, BillingTaxi } from "./billing";
import { recapCsv, recapItems, recapPdfName, recapWeeks } from "./recap";

// Données fictives.
const bus = (id: string, day: string, o: Partial<BillingBus> = {}) =>
  ({
    id,
    district: "DSO",
    orderRef: `CMD-${id.toUpperCase().padEnd(6, "2").slice(0, 6)}`,
    number: 1,
    status: "envoye",
    day,
    relation: "TC_TEST",
    author: "",
    company: "Autocars Fictifs",
    callTime: "05:00",
    buses: [
      { plate: "", planned: "06:00", actual: "", demob: "", cancelled: false },
      { plate: "", planned: "05:30", actual: "", demob: "", cancelled: true },
    ],
    capacity: 80,
    passengers: 0,
    roundTrip: false,
    origin: "Gare Alpha",
    destination: "Gare Bravo",
    direct: true,
    lines: [],
    reason: "",
    c3Type: 2,
    cancelReason: "",
    ...o,
  }) as BillingBus & { id: string };

const taxi = (id: string, day: string, o: Partial<BillingTaxi> = {}) =>
  ({
    id,
    orderRef: "CMD-TAXI22",
    number: 2,
    status: "annule",
    requestDay: day,
    day,
    time: "08:00",
    author: "",
    vehicles: 1,
    company: "Taxi Fictif",
    passengers: 1,
    from: "Gare Alpha",
    to: "Gare Charlie",
    vias: ["Gare Delta"],
    roundTrip: false,
    reason: "=1+1",
    billing: "SNCB",
    relation: "",
    isPmr: true,
    pmrReason: "",
    pmrFile: "",
    cancelReason: "",
    cancelledAt: "",
    ...o,
  }) as BillingTaxi & { id: string };

describe("récap par semaine", () => {
  const items = recapItems({
    bus: [bus("a", "2026-11-03"), bus("b", "2026-10-30")],
    taxi: [taxi("c", "2026-11-02")],
  });

  it("lignes communes triées par jour et heure", () => {
    expect(items.map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(items.find((i) => i.id === "a")).toMatchObject({ time: "06:00", vehicles: 1 });
    expect(items.find((i) => i.id === "c")).toMatchObject({
      route: "Gare Alpha → Gare Delta → Gare Charlie",
      vehicles: 0,
    });
  });

  it("semaines et compteurs", () => {
    const weeks = recapWeeks(items);
    expect(weeks.map((w) => w.key)).toEqual(["2026-W45", "2026-W44"]);
    expect(weeks[0]!.label).toBe("Semaine 45 · du 2 au 8 novembre 2026");
    expect(weeks[0]!.counts).toEqual({ bus: 1, taxi: 1, cancelled: 1, vehicles: 1 });
  });

  it("nom des PDF et CSV neutralisé", () => {
    expect(recapPdfName(items[0]!)).toBe("bus/CMD-B22222.pdf");
    const csv = recapCsv(items, { "taxi-c": "PDF généré" });
    expect(csv.startsWith("﻿Type;N° de commande;")).toBe(true);
    expect(csv).toContain("Taxi PMR;CMD-TAXI22;;02/11/2026;08:00;");
    expect(csv).toContain("Annulé");
    expect(csv).toContain("PDF généré");
    expect(csv).not.toContain("=1+1"); // le motif n'est pas exporté
  });
});
