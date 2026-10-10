import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

import { busDraftSchema, taxiDraftSchema } from "@/lib/orders/schemas";

vi.mock("server-only", () => ({}));

const { busOrderPdf, roadmapPdf, safe, taxiOrderPdf } = await import("./order-pdf");

// Données fictives.
const ctx = {
  agentName: "Agent Exemple",
  drivers: [{ id: "drv000000000001", name: "Chauffeur Exemple", phone: "+32 470 00 00 00" }],
  generatedAt: new Date("2026-10-08T10:00:00Z"),
};

const bus = (stops: number, buses: number) => ({
  meta: { number: 42, status: "envoye" as const },
  company: {
    name: "Autocars Exemple",
    email: "planning@bus-exemple.be",
    phone: "+32 65 00 00 00",
    address: "Rue de l'Exemple 1, 7000 Mons",
  },
  draft: busDraftSchema.parse({
    c3_type: 1,
    reason: "Dérangement caténaire → évacuation « urgente » ; cœur du réseau, 0 €",
    order_date: "2026-10-08",
    call_time: "07:40",
    relation: "R-1234",
    origin: "Mons",
    destination: "Tournai",
    stops: Array.from({ length: stops }, (_, i) => `Arrêt fictif n° ${i + 1}`),
    district: "Sud-Ouest",
    buses: Array.from({ length: buses }, (_, i) => ({
      planned: `08:${String(i * 4).padStart(2, "0")}`,
      plate: `1-ABC-${100 + i}`,
      driver: i === 0 ? "drv000000000001" : "",
      cancelled: i === 2,
      specific_route: i === 1,
      origin: "Ath",
      destination: "Tournai",
    })),
  }),
});

const taxi = {
  meta: { number: 7, status: "brouillon" as const },
  company: {
    name: "Taxi Exemple",
    emails: ["resa@taxi-exemple.be"],
    phones: ["+32 65 11 11 11"],
    addresses: ["Place Fictive 2, 7000 Mons"],
  },
  client: { lastName: "Exemple", firstName: "Camille", type: "CRF" },
  snapshot: {
    taxiName: "",
    taxiPhone: "",
    taxiAddress: "",
    pmrLastName: "",
    pmrFirstName: "",
    pmrFile: "",
  },
  draft: taxiDraftSchema.parse({
    trip_day: "2026-10-08",
    trip_time: "14:30",
    from_station: "Mons",
    to_station: "Tournai",
    round_trip: true,
    return_day: "2026-10-08",
    return_time: "18:00",
    is_pmr: true,
    pmr_count: 1,
    pmr_reason: "Défaut rampes mobiles B-PT2",
    passengers: 2,
  }),
};

const pageCount = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();
const head = (bytes: Uint8Array) => new TextDecoder().decode(bytes.slice(0, 5));

describe("safe", () => {
  it("remplace ce que WinAnsi ne sait pas encoder", () => {
    expect(safe("Mons → Tournai")).toBe("Mons > Tournai");
    expect(safe("l’arrêt")).toBe("l’arrêt");
    expect(safe("cœur")).toBe("cœur");
    expect(safe("12\u202f€")).toBe("12 €");
    expect(safe("Dvořák ✓")).toBe("Dvorák ?");
  });

  it("produit toujours un texte encodable en Helvetica", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const all = Array.from({ length: 0x2fff }, (_, i) => String.fromCodePoint(i + 1)).join("");
    expect(() => font.encodeText(safe(all))).not.toThrow();
    expect(() => font.encodeText("→")).toThrow();
  });
});

describe("busOrderPdf", () => {
  it("génère un PDF d'une page", async () => {
    const bytes = await busOrderPdf(bus(3, 2), ctx);
    expect(head(bytes)).toBe("%PDF-");
    expect(await pageCount(bytes)).toBe(1);
  });

  it("passe sur une 2e page avec 30 arrêts et 12 bus", async () => {
    const bytes = await busOrderPdf(bus(30, 12), ctx);
    expect(head(bytes)).toBe("%PDF-");
    expect(await pageCount(bytes)).toBe(2);
  });

  it("tolère une commande vide", async () => {
    const bytes = await busOrderPdf(
      { meta: { number: 0, status: "brouillon" }, company: null, draft: busDraftSchema.parse({}) },
      { agentName: "" },
    );
    expect(await pageCount(bytes)).toBe(1);
  });
});

describe("taxiOrderPdf", () => {
  it("génère un PDF d'une page", async () => {
    const bytes = await taxiOrderPdf(taxi, ctx);
    expect(head(bytes)).toBe("%PDF-");
    expect(await pageCount(bytes)).toBe(1);
  });
});

describe("feuille de route", () => {
  it("produit un PDF lisible, sans échouer sur les caractères spéciaux", async () => {
    const pdf = await roadmapPdf(
      {
        day: "2026-10-10",
        station: "Mons",
        abbr: "FMS",
        district: "Sud-Ouest",
        withNames: true,
        rows: [
          {
            time: "07:12",
            train: "IC 3804",
            io: "IN",
            who: "1 × chaise roulante fixe",
            other: "vers Bruxelles-Midi",
            dossier: "2026-10-10-0001",
            client: "Client fictif · 0470 00 00 00",
            extra: "RDV guichet → quai 3",
            cancelled: false,
          },
          {
            time: "",
            train: "Taxi",
            io: "OUT",
            who: "Groupe de 34 (dont 30 enfants)",
            other: "de Namur",
            dossier: "",
            client: "",
            extra: "",
            cancelled: true,
          },
        ],
        equipment: [
          {
            platform: "3",
            rampType: "Rampe pliante",
            rampId: "R12",
            state: "ok",
            stateNote: "",
            padlock: "1234",
            validUntil: "2026-12-31",
            rampNote: "Clé au guichet",
            stationRestrictions: "",
            stationInfo: "",
          },
        ],
        contacts: [{ name: "Gare de Mons (fictif)", phone: "065 00 00 00", group: "Borne PMR" }],
      },
      { agentName: "Agent test", generatedAt: new Date("2026-10-10T08:00:00Z") },
    );
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  });
});
