import { describe, expect, it } from "vitest";

import {
  billingWorkbook,
  BILLING_STYLE,
  BUS_HEADER,
  busRow,
  providedBuses,
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
import { excelDate, type XlsxCell } from "@/lib/xlsx";

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

  it("ligne bus : bus fournis, % fourni, trajets, coche verte dans la colonne C3", () => {
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
    expect(col("C3")).toBe("✔");
    expect(col("% fourni")).toBe(0.67);
    expect(col("N° facture")).toBe("");
  });

  it("bon annulé : « Annulé » en remarque, bus gardés (comme le classeur de référence)", () => {
    const r = busRow(bus({ status: "annule", cancelReason: "Ligne rétablie" }));
    expect(r[BUS_HEADER.indexOf("Remarque")]).toBe("Annulé : Ligne rétablie · 1 bus annulé");
    expect(r[BUS_HEADER.indexOf("Nbr de bus")]).toBe(2);
  });

  it("un bus venu puis démobilisé (« démob. annulation ») reste compté comme fourni", () => {
    const one = bus({
      roundTrip: false,
      buses: [
        { plate: "1-ABC-009", planned: "07:00", actual: "", demob: "08:00", cancelled: true },
      ],
    });
    const r = busRow(one);
    expect(providedBuses(one)).toHaveLength(1);
    expect(r[BUS_HEADER.indexOf("Nbr de bus demandé")]).toBe(1);
    expect(r[BUS_HEADER.indexOf("Nbr de bus")]).toBe(1);
    expect(r[BUS_HEADER.indexOf("% fourni")]).toBe(1);
    expect(r[BUS_HEADER.indexOf("Nbr de trajet simple")]).toBe(1);
    const never = bus({
      buses: [{ plate: "", planned: "07:00", actual: "", demob: "", cancelled: true }],
    });
    expect(busRow(never)[BUS_HEADER.indexOf("Nbr de bus")]).toBe(0);
    expect(busRow(never)[BUS_HEADER.indexOf("% fourni")]).toBe(0);
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

  it("feuille BUS : en-tête mis en forme, une section par société, totaux en formules SUM", () => {
    const s = busSheet(
      [bus(), bus({ orderRef: "CMD-22222A", day: "2026-11-01" }), bus({ company: "" })],
      { district: "DSO", period: "MOIS de NOVEMBRE 2026", sentOn: "2026-11-04" },
    );
    const v = (c: XlsxCell) => (typeof c === "object" && c !== null ? c.v : c);
    const st = (c: XlsxCell) => (typeof c === "object" && c !== null ? c.s : undefined);
    expect(v(s.rows[0]![0]!)).toBe("DATE D'ENVOI :");
    expect(v(s.rows[0]![2]!)).toBe(excelDate("2026-11-04"));
    expect(st(s.rows[0]![2]!)?.numFmt).toBe("dd/mm/yyyy");
    expect(v(s.rows[0]![3]!)).toBe("Transports alternatifs BUS DSO");
    expect(st(s.rows[0]![3]!)).toEqual(BILLING_STYLE.busTitle);
    expect(v(s.rows[2]![0]!)).toBe("MOIS de NOVEMBRE 2026");
    expect(s.merges).toEqual(expect.arrayContaining(["A1:B1", "A2:B2", "C1:C2", "D1:X2", "A3:X3"]));
    const titles = s.rows
      .filter((r) => st(r[0]) === BILLING_STYLE.section || st(r[0]) === BILLING_STYLE.sectionOther)
      .map((r) => v(r[0]));
    expect(titles).toEqual(["Autocars Fictifs", "AUTRE SOCIETE"]);
    const hi = s.rows.findIndex((r) => v(r[0]) === "Date");
    expect(v(s.rows[hi]![3]!)).toBe("Dispo Kim Cars / Degrève");
    expect(st(s.rows[hi]![0]!)).toEqual(BILLING_STYLE.header);
    expect(s.heights?.[hi]).toBe(48);
    const first = s.rows[hi + 1]!;
    expect(v(first[24])).toBe("✔");
    expect(v(first[0])).toBe(excelDate("2026-11-01")); // vraie date Excel
    expect(st(first[5])?.numFmt).toBe("0%");
    const total = s.rows[hi + 3]!;
    expect(v(total[0])).toBe("TOTAL");
    expect(total[11]).toMatchObject({ f: `SUM(L${hi + 2}:L${hi + 3})`, v: 4 });
    expect(total[15]).toMatchObject({ f: `SUM(P${hi + 2}:P${hi + 3})`, v: 280 });
    expect(s).toMatchObject({ landscape: true, fitWidth: true });
  });

  it("classeur : quatre feuilles, titres fusionnés, volet figé", () => {
    const wb = billingWorkbook(
      { bus: [], taxi: [taxi(), taxi({ isPmr: true, orderRef: "CMD-4444BB" })] },
      { district: "DSE", period: "SEMAINE 45 · du 2 au 8 novembre 2026", sentOn: "2026-11-04" },
      { bus: ["Autocars Fictifs"], taxi: ["Taxi Fictif"] },
    );
    const v = (c: XlsxCell) => (typeof c === "object" && c !== null ? c.v : c);
    expect(wb.map((s) => s.name)).toEqual(["BUS", "TAXI", "TAXI PMR", "Données"]);
    expect(wb[1]!.rows).toHaveLength(4);
    expect(wb[2]!.rows).toHaveLength(4);
    expect(v(wb[1]!.rows[0]![0])).toBe("Transports alternatifs TAXI DSE");
    expect(wb[1]!.merges).toEqual(["A1:M1", "A2:M2"]);
    expect(wb[2]!.merges).toEqual(["A1:O1", "A2:O2"]);
    expect(wb[1]!.freeze).toBe("A4");
    expect(v(wb[1]!.rows[3]![0])).toBe(excelDate("2026-11-02"));
    expect(wb[0]!.rows.some((r) => v(r[0]) === "Aucun bon bus sur la période.")).toBe(true);
  });
});
