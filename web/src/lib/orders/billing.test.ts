import { describe, expect, it } from "vitest";

import {
  billingWorkbook,
  BUS_HEADER,
  busRow,
  busSheet,
  composition,
  frDay,
  monthPeriod,
  redactorLabel,
  TAXI_HEADER,
  TAXI_PMR_HEADER,
  taxiPmrRow,
  taxiRow,
  type BillingBus,
  type BillingTaxi,
} from "./billing";

// Données fictives : aucun nom, n° ni société réels.
const bus = (o: Partial<BillingBus> = {}): BillingBus => ({
  orderRef: "CMD-7K4P2M",
  number: 12,
  status: "envoye",
  day: "2026-11-03",
  relation: "TC_TEST-01",
  author: "Alice Exemple",
  company: "Autocars Fictifs",
  callTime: "05:40",
  buses: [
    { plate: "1-ABC-001", planned: "06:10", actual: "06:15", demob: "11:00", cancelled: false },
    { plate: "1-ABC-002", planned: "06:05", actual: "", demob: "12:30", cancelled: false },
    { plate: "", planned: "06:20", actual: "", demob: "", cancelled: true },
  ],
  capacity: 80,
  passengers: 140,
  roundTrip: true,
  origin: "Gare Alpha",
  destination: "Gare Bravo",
  direct: false,
  lines: ["L.96"],
  reason: "Dérangement fictif",
  c3Type: 2,
  cancelReason: "",
  ...o,
});

const taxi = (o: Partial<BillingTaxi> = {}): BillingTaxi => ({
  orderRef: "CMD-3QX9WB",
  number: 4,
  status: "envoye",
  requestDay: "2026-11-01",
  day: "2026-11-02",
  time: "14:30",
  author: "Bruno Essai",
  vehicles: 1,
  company: "Taxi Fictif",
  passengers: 2,
  from: "Gare Alpha",
  to: "Gare Charlie",
  vias: [],
  roundTrip: false,
  reason: "Correspondance manquée",
  billing: "SNCB",
  relation: "R-9",
  isPmr: false,
  pmrReason: "",
  pmrFile: "",
  cancelReason: "",
  cancelledAt: "",
  ...o,
});

describe("fichier facturation", () => {
  it("mises en forme", () => {
    expect(frDay("2026-11-03")).toBe("03/11/2026");
    expect(frDay("")).toBe("");
    expect(redactorLabel("Alice Exemple")).toBe("Exemple A.");
    expect(redactorLabel("Jean Van Essai")).toBe("Van Essai J.");
    expect(redactorLabel("PaCo")).toBe("PaCo");
    expect(composition(120)).toBe("BUS articulé (120pl)");
    expect(composition(55)).toBe("Autre (55pl)");
    expect(monthPeriod("2026-11")).toBe("MOIS de NOVEMBRE 2026");
  });

  it("ligne bus : bus actifs, heures, n° de commande dans la colonne C3", () => {
    const r = busRow(bus());
    const col = (h: string) => r[BUS_HEADER.indexOf(h)];
    expect(r).toHaveLength(BUS_HEADER.length);
    expect(col("Date")).toBe("03/11/2026");
    expect(col("Relation")).toBe("TC_TEST-01");
    expect(col("Rédacteur C3")).toBe("Exemple A.");
    expect(col("Nbr de bus demandé")).toBe(3);
    expect(col("Remarque")).toBe("1 bus annulé");
    expect(col("Prévision sur place")).toBe("06:05");
    expect(col("Heure sur place")).toBe("06:15");
    expect(col("Heure de fin")).toBe("12:30");
    expect(col("Nbr de bus")).toBe(2);
    expect(col("Bus/Car")).toBe("BUS (80pl)");
    expect(col("N° plaque")).toBe("1-ABC-001, 1-ABC-002");
    expect(col("Aller ou A/R")).toBe("A/R");
    expect(col("Nbr de trajet simple")).toBe(4);
    expect(col("Direct/Omnibus")).toBe("Omnibus");
    expect(col("C3")).toBe("CMD-7K4P2M");
    expect(col("% fourni")).toBe("");
    expect(col("N° facture")).toBe("");
  });

  it("bon annulé : remarque, aucun bus compté", () => {
    const r = busRow(bus({ status: "annule", cancelReason: "Ligne rétablie" }));
    expect(r[BUS_HEADER.indexOf("Remarque")]).toBe("Annulé : Ligne rétablie · 1 bus annulé");
    expect(r[BUS_HEADER.indexOf("Nbr de bus")]).toBe(0);
  });

  it("taxi et taxi PMR : CMD en N°PACO / Référence, dossier sans nom", () => {
    const t = taxiRow(taxi({ vias: ["Gare Delta"] }));
    expect(t).toHaveLength(TAXI_HEADER.length);
    expect(t[1]).toBe("CMD-3QX9WB");
    expect(t[TAXI_HEADER.indexOf("à")]).toBe("Gare Charlie (via Gare Delta)");
    const p = taxiPmrRow(
      taxi({
        isPmr: true,
        pmrFile: "2026-11-02-0001",
        pmrReason: "Gare taxi",
        status: "annule",
        cancelReason: "Voyage reporté",
        cancelledAt: "01/11/2026 18:00",
      }),
    );
    expect(p).toHaveLength(TAXI_PMR_HEADER.length);
    expect(p[0]).toBe("01/11/2026");
    expect(p[TAXI_PMR_HEADER.indexOf("Si annulation (date/heure + motif)")]).toBe(
      "01/11/2026 18:00 · Voyage reporté",
    );
    expect(p[TAXI_PMR_HEADER.indexOf("N° Dossier")]).toBe("2026-11-02-0001");
    expect(p[TAXI_PMR_HEADER.indexOf("Référence")]).toBe("CMD-3QX9WB · R-9");
  });

  it("feuille BUS : une section par société, « AUTRE SOCIETE » en dernier, totaux", () => {
    const s = busSheet(
      [bus(), bus({ orderRef: "CMD-22222A", day: "2026-11-01" }), bus({ company: "" })],
      { district: "DSO", period: "MOIS de NOVEMBRE 2026", sentOn: "2026-11-04" },
    );
    expect(s.rows[0]).toEqual([
      "DATE D'ENVOI :",
      "04/11/2026",
      "",
      "Transports alternatifs BUS DSO",
    ]);
    expect(s.rows[2]).toEqual(["MOIS de NOVEMBRE 2026"]);
    const titles = s.rows.filter((r) => r.length === 1).map((r) => r[0]);
    expect(titles).toEqual([
      " (du fichier à la facturation)",
      "MOIS de NOVEMBRE 2026",
      "Autocars Fictifs",
      "AUTRE SOCIETE",
    ]);
    const header = s.rows.find((r) => r[0] === "Date")!;
    expect(header[3]).toBe("Dispo Autocars Fictifs");
    const first = s.rows.indexOf(header) + 1;
    expect(s.rows[first]![24]).toBe("CMD-22222A"); // tri par jour
    const totals = s.rows.filter((r) => r[0] === "Total");
    expect(totals[0]![11]).toBe(4);
    expect(s.merges).toContain("A3:Y3");
  });

  it("classeur : quatre feuilles, aucune ligne vide de données", () => {
    const wb = billingWorkbook(
      { bus: [], taxi: [taxi(), taxi({ isPmr: true, orderRef: "CMD-4444BB" })] },
      { district: "DSE", period: "SEMAINE 45 · du 2 au 8 novembre 2026", sentOn: "2026-11-04" },
      { bus: ["Autocars Fictifs"], taxi: ["Taxi Fictif"] },
    );
    expect(wb.map((s) => s.name)).toEqual(["BUS", "TAXI", "TAXI PMR", "Données"]);
    expect(wb[1]!.rows).toHaveLength(4);
    expect(wb[2]!.rows).toHaveLength(4);
    expect(wb[1]!.rows[0]).toEqual(["Transports alternatifs TAXI DSE"]);
    expect(wb[0]!.rows.some((r) => r[0] === "Aucun bon bus sur la période.")).toBe(true);
  });
});
