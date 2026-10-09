import { describe, expect, it } from "vitest";

import {
  busFilename,
  busMail,
  busStops,
  escapeHtml,
  officeFor,
  PACO_OFFICES,
  taxiMail,
  type BusMailDetail,
  type TaxiMailDetail,
} from "./mail";
import { busDraftSchema, taxiDraftSchema } from "./schemas";

// Données fictives.
const bus: BusMailDetail = {
  meta: { number: 42 },
  company: { name: "Autocars Exemple", email: "planning@bus-exemple.be; dispatch@bus-exemple.be" },
  draft: busDraftSchema.parse({
    c3_type: 2,
    reason: "Dérangement caténaire <b>L96</b>",
    order_date: "2026-10-08",
    call_time: "07:40",
    relation: "R-1234",
    origin: "Mons",
    destination: "Tournai",
    stops: ["Jurbise", "Ath"],
    district: "Sud-Est",
    bus_capacity: 60,
    buses: [
      { planned: "08:15" },
      { planned: "08:45", cancelled: true },
      { planned: "09:15", specific_route: true, origin: "Ath", destination: "Tournai" },
    ],
  }),
};

const taxi: TaxiMailDetail = {
  meta: { number: 7 },
  company: { name: "Taxi Exemple", emails: ["resa@taxi-exemple.be"] },
  client: { type: "CRF" },
  draft: taxiDraftSchema.parse({
    trip_day: "2026-10-08",
    trip_time: "14:30",
    from_station: "Mons",
    to_station: "Tournai",
    via_station: "Ath",
    round_trip: true,
    return_day: "2026-10-08",
    return_time: "18:00",
    taxi_email: "resa@taxi-exemple.be",
    is_pmr: true,
    pmr_count: 1,
    passengers: 2,
    billing: "SNCB",
  }),
};

describe("bureaux PACO", () => {
  it("par district, Sud-Ouest par défaut", () => {
    expect(officeFor("Sud-Est").email).toBe("paco.namur@belgiantrain.be");
    expect(officeFor("Centre").email).toBe("paco.brussels@belgiantrain.be");
    expect(officeFor("")).toBe(PACO_OFFICES["Sud-Ouest"]);
    expect(officeFor(undefined).city).toBe("7000 Mons");
  });
});

describe("busMail", () => {
  const m = busMail(bus, { agentName: "Agent Exemple" });

  it("destinataires et copie du bureau du district", () => {
    expect(m.to).toEqual(["planning@bus-exemple.be", "dispatch@bus-exemple.be"]);
    expect(m.cc).toEqual(["paco.namur@belgiantrain.be"]);
  });

  it("sujet et nom de fichier", () => {
    expect(m.subject).toBe(
      "Réquisitoire bus C3 n° 42 – 08/10/2026 – Mons → Tournai – relation R-1234",
    );
    expect(m.filename).toBe("2026-10-08 · C3-2 · Mons → Tournai.pdf");
    expect(
      busFilename({ ...bus.draft, origin: 'Bruxelles/Midi: "quai"', destination: "A<B>|C?" }),
    ).toBe("2026-10-08 · C3-2 · Bruxelles Midi quai → A B C.pdf");
  });

  it("le corps contient l'essentiel, horaires des seuls bus actifs", () => {
    for (const s of [
      "jeudi 8 octobre 2026",
      "C3-2 – Remplacement",
      "Jurbise – Ath",
      "Aller simple",
      "Nombre de bus : 2",
      "60 places",
      "Bus 1 : 08:15",
      "Bus 3 : 09:15 (trajet : Ath → Tournai)",
      "Le bon de commande est joint en PDF.",
      "Agent Exemple",
      "SNCB – Client Solutions",
      "Place de la Station 1, 5000 Namur",
    ])
      expect(m.text).toContain(s);
    expect(m.text).not.toContain("08:45");
  });

  it("échappe le HTML saisi", () => {
    expect(m.html).toContain("&lt;b&gt;L96&lt;/b&gt;");
    expect(m.html).not.toContain("<b>L96");
    expect(escapeHtml(`<a href="x">'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&lt;/a&gt;");
  });

  it("direct, ou arrêts saisis à la main", () => {
    expect(
      busMail({ ...bus, draft: { ...bus.draft, direct: true } }, { agentName: "A" }).text,
    ).toContain("Arrêts : Direct (sans arrêt)");
    expect(
      busStops({ ...bus.draft, stops_mode: "manuel", stops_manual: "Ath\nLeuze ; Péruwelz" }),
    ).toEqual(["Ath", "Leuze", "Péruwelz"]);
    expect(
      busStops({
        ...bus.draft,
        stops_mode: "auto",
        stops: ["Namêche (L.125)", "Leman (L.125)", "Ath"],
      }),
    ).toEqual(["Namêche", "Leman", "Ath"]);
  });
});

describe("taxiMail", () => {
  const m = taxiMail(taxi, { agentName: "Agent Exemple" });

  it("destinataires dédoublonnés, copie Sud-Ouest par défaut", () => {
    expect(m.to).toEqual(["resa@taxi-exemple.be"]);
    expect(m.cc).toEqual(["paco.mons@belgiantrain.be"]);
  });

  it("sujet, nom de fichier et corps", () => {
    expect(m.subject).toBe("Commande taxi n° 7 – 08/10/2026 14:30 – Mons → Tournai");
    expect(m.filename).toBe("2026-10-08 · Taxi · Mons → Tournai.pdf");
    for (const s of [
      "jeudi 8 octobre 2026 à 14:30",
      "Via : Ath",
      "Retour : Oui – jeudi 8 octobre 2026 à 18:00, Tournai → Mons",
      "Passagers : 2",
      "Véhicules : 1",
      "PMR : Oui – Chaise roulante fixe (1 PMR)",
      "À charge de SNCB",
    ])
      expect(m.text).toContain(s);
  });
});
