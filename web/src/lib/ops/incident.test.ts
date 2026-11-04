import { describe, expect, it } from "vitest";

import { activeBusCount, buildIncident, type IncidentLog, type IncidentOrder } from "./incident";

const order = (o: Partial<IncidentOrder>): IncidentOrder => ({
  id: "o1",
  status: "brouillon",
  origin: "Mons",
  destination: "Charleroi-Central",
  callTime: "06:42",
  reason: "Dérangement caténaire",
  passengers: 0,
  buses: [{}],
  ...o,
});
const log = (l: Partial<IncidentLog>): IncidentLog => ({
  id: "l1",
  time: "06:10",
  label: "Message",
  urgent: false,
  irail: false,
  ...l,
});

describe("buildIncident", () => {
  it("rien d'affiché quand tout est calme (perturbations iRail seules comprises)", () => {
    expect(buildIncident([], [])).toBeNull();
    expect(buildIncident([], [log({ irail: true })])).toBeNull();
    expect(buildIncident([order({ status: "termine" })], [])).toBeNull();
  });

  it("bons du jour en cours : trajet principal, bus actifs, voyageurs, heure de début", () => {
    const i = buildIncident(
      [
        order({ id: "a", callTime: "07:10", buses: [{}, { cancelled: true }], passengers: 60 }),
        order({ id: "b", callTime: "06:42", buses: [{}, { demob: "09:00" }, {}], passengers: 40 }),
        order({ id: "c", origin: "Tournai", destination: "Ath", callTime: "08:00", buses: [{}] }),
      ],
      [log({ irail: true }), log({ id: "u", urgent: true, time: "06:30", label: "Panne" })],
    )!;
    expect(i.title).toBe("Bus de remplacement Mons → Charleroi-Central et 1 autre trajet");
    expect(i.main).toMatchObject({
      origin: "Mons",
      destination: "Charleroi-Central",
      orders: 2,
      buses: 3,
    });
    expect(i.activeBuses).toBe(4);
    expect(i.passengers).toBe(100);
    expect(i.since).toBe("06:30");
    expect(i.detail).toBe("Dérangement caténaire");
    expect(i.urgent).toBe(1);
    expect(i.disturbances).toBe(1);
    expect(i.href).toBe("/commandes/suivi?vue=aujourdhui");
  });

  it("urgence seule : titre = texte de l'urgence, lien vers le Journal", () => {
    const i = buildIncident([], [log({ urgent: true, label: "  Personne sur les voies  " })])!;
    expect(i.title).toBe("Personne sur les voies");
    expect(i.main).toBeNull();
    expect(i.href).toBe("/operations/journal?urgentes=1");
  });

  it("bus actifs : ni annulés ni démobilisés", () => {
    expect(activeBusCount(order({ buses: [{}, { cancelled: true }, { demob: "10:00" }] }))).toBe(1);
  });
});
