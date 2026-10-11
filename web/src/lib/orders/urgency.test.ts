import { describe, expect, it } from "vitest";

import { busUrgency, firstDeparture } from "./urgency";

const at = (h: number, m = 0) => h * 60 + m;

describe("firstDeparture", () => {
  it("prend la plus petite heure prévue des bus non annulés", () => {
    expect(
      firstDeparture("06:00", [
        { planned: "09:30" },
        { planned: "07:10", cancelled: true },
        { planned: "08:45" },
      ]),
    ).toBe("08:45");
  });
  it("retombe sur l'heure d'appel, sinon rien", () => {
    expect(firstDeparture("06:00", [{ planned: "" }])).toBe("06:00");
    expect(firstDeparture("", null)).toBe("");
  });
});

describe("busUrgency (H-2)", () => {
  const order = { status: "envoye", day: "2026-10-11", buses: [{ planned: "14:00" }] };
  it("signale un bon envoyé dont le départ est dans 2 h au plus", () => {
    expect(busUrgency(order, "2026-10-11", at(12, 0))).toEqual({ time: "14:00", minutes: 120 });
    expect(busUrgency(order, "2026-10-11", at(13, 30))?.minutes).toBe(30);
  });
  it("ignore un départ à plus de 2 h", () => {
    expect(busUrgency(order, "2026-10-11", at(11, 59))).toBeNull();
  });
  it("garde le bon jusqu'à 1 h après le départ prévu, puis plus", () => {
    expect(busUrgency(order, "2026-10-11", at(15, 0))?.minutes).toBe(-60);
    expect(busUrgency(order, "2026-10-11", at(15, 1))).toBeNull();
  });
  it("ne signale que les bons envoyés (pas confirmés, brouillons ni annulés)", () => {
    for (const status of ["confirme", "brouillon", "annule", "en_cours"])
      expect(busUrgency({ ...order, status }, "2026-10-11", at(13))).toBeNull();
  });
  it("passe minuit : départ demain à 00:30, il est 23:00", () => {
    const night = { status: "envoye", day: "2026-10-12", buses: [{ planned: "00:30" }] };
    expect(busUrgency(night, "2026-10-11", at(23))?.minutes).toBe(90);
    expect(busUrgency(night, "2026-10-10", at(23))).toBeNull();
  });
  it("sans heure connue : rien", () => {
    expect(
      busUrgency({ status: "envoye", day: "2026-10-11", buses: [] }, "2026-10-11", 0),
    ).toBeNull();
  });
});
