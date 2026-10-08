import { describe, expect, it } from "vitest";

import {
  frName,
  frText,
  mapDossier,
  mapMission,
  mapStatus,
  missionDay,
  travelerSummary,
} from "./dicos-mission";

// Mission DICOS fictive (aucune donnée réelle), liste fusionnée avec son détail.
const detail = {
  id: "999001",
  missionType: "Departure",
  reservationType: "Disabled",
  status: "Completed",
  clientStatus: "Present",
  reservationId: "2026-10-07-0999",
  reservationDisplayId: "2026-10-07-0999",
  owner: { name: "Agent Fictif" },
  journey: {
    trainNumber: 429,
    transportId: "429",
    time: "2026-10-08T07:30:00+02:00",
    stationName: "LIÈGE-GUILLEMINS / LUIK-GUILLEMINS",
    otherStationName: "BRUXELLES-MIDI / BRUSSEL-ZUID",
    coachNumber: "4",
    doorNumber: "2",
  },
  traveler: {
    disableds: [{ typeId: "pmr-bp", quantity: 2, symbol: "blind-person" }],
    fullAssistances: 0,
    lightAssistances: 2,
  },
  client: {
    firstName: "Prénom",
    lastName: "Nom Fictif",
    phoneNumber: "",
    email: "exemple@invalid.test",
    language: "French",
    description: null,
  },
  trainManager: { employeeId: "1", name: "Chef Démo", phoneNumber: "0032490000000" },
  driver: { employeeId: "2", name: "Conducteur Démo", phoneNumber: null },
  meetingPoint: [
    { language: "Dutch", text: "Toegang buffet" },
    { language: "French", text: "Accès buffet" },
  ],
};

describe("mapping DICOS", () => {
  it("nom de gare FR et texte multilingue", () => {
    expect(frName("LIÈGE-GUILLEMINS / LUIK-GUILLEMINS")).toBe("LIÈGE-GUILLEMINS");
    expect(frName("NAMUR")).toBe("NAMUR");
    expect(frText(detail.meetingPoint)).toBe("Accès buffet");
    expect(frText([])).toBe("");
  });

  it("type et nombre depuis le détail (disableds typés)", () => {
    expect(travelerSummary(detail.traveler)).toEqual({ type: "NV", pax: 4 });
    expect(
      travelerSummary({
        disableds: [{ typeId: "pmr-ew", quantity: 1 }],
        fullAssistances: 1,
        lightAssistances: 0,
      }),
    ).toEqual({ type: "CRE", pax: 2 });
    expect(travelerSummary({ disableds: [{ typeId: "pmr-inconnu", quantity: 1 }] })).toEqual({
      type: "AUTRE",
      pax: 1,
    });
    // Codes réels confirmés le 8 oct. 2026 (par symbole d'abord, repli typeId).
    expect(
      travelerSummary({
        disableds: [{ typeId: "pmr-wc", quantity: 3, symbol: "fixed-wheelchair" }],
        fullAssistances: 3,
      }),
    ).toEqual({ type: "CRF", pax: 6 });
    expect(
      travelerSummary({
        disableds: [{ typeId: "pmr-fw", quantity: 1, symbol: "folding-wheelchair" }],
        fullAssistances: 1,
      }),
    ).toEqual({ type: "CRP", pax: 2 });
    // Symbole inconnu mais typeId connu → repli sur typeId.
    expect(
      travelerSummary({ disableds: [{ typeId: "pmr-bp", symbol: "x", quantity: 1 }] }),
    ).toEqual({
      type: "NV",
      pax: 1,
    });
  });

  it("type et nombre depuis la liste (compteurs seuls)", () => {
    expect(travelerSummary({ disableds: 1, fullAssistances: 0, lightAssistances: 1 })).toEqual({
      type: "",
      pax: 2,
    });
    expect(travelerSummary({ disableds: 0, fullAssistances: 0, lightAssistances: 2 })).toEqual({
      type: "MR",
      pax: 2,
    });
  });

  it("statut (client absent prioritaire)", () => {
    expect(mapStatus("Completed", "Present")).toBe("realisee");
    expect(mapStatus("New", "Unknown")).toBe("prevue");
    expect(mapStatus("Deleted", "Unknown")).toBe("annulee");
    expect(mapStatus("Completed", "Absent")).toBe("absent");
  });

  it("jour de service (heure locale DICOS)", () => {
    expect(missionDay(detail)).toBe("2026-10-08");
    expect(missionDay({ id: "x", journey: {} })).toBe("");
  });

  it("garde défensive : offset UTC converti en Europe/Brussels", () => {
    // 2026-10-07T23:30:00Z = 2026-10-08 01:30 à Bruxelles (heure d'été, +02:00).
    const { assist } = mapMission({
      ...detail,
      journey: { ...detail.journey, time: "2026-10-07T23:30:00Z" },
    });
    expect(assist.day).toBe("2026-10-08");
    expect(assist.time).toBe("01:30");
    // Heure d'hiver (+01:00) : 2026-01-07T23:30:00Z = 2026-01-08 00:30 à Bruxelles.
    const w = mapMission({
      ...detail,
      journey: { ...detail.journey, time: "2026-01-07T23:30:00Z" },
    }).assist;
    expect(w.day).toBe("2026-01-08");
    expect(w.time).toBe("00:30");
  });

  it("mappe une mission complète", () => {
    const { assist, mission } = mapMission(detail);
    expect(assist).toMatchObject({
      dicos_id: "999001",
      day: "2026-10-08",
      time: "07:30",
      station: "LIÈGE-GUILLEMINS",
      other_station: "BRUXELLES-MIDI",
      district: "DSE", // Liège-Guillemins → Sud-Est
      direction: "depart",
      train: "429",
      dicos_ref: "2026-10-07-0999",
      pax: 4,
      pmr_type: "NV",
      status: "realisee",
      source: "dicos",
    });
    expect(mission.client_email).toBe("exemple@invalid.test");
    expect(mission.meeting_point).toBe("Accès buffet");
    expect(mission.train_manager_phone).toBe("0032490000000");
    expect(mission.driver_phone).toBe("");
    expect(mission.coach).toBe("4");
  });

  it("réf. de dossier au mauvais format ignorée, Stickering sans sens", () => {
    const { assist } = mapMission({
      ...detail,
      missionType: "Stickering",
      reservationId: "ABC",
      reservationDisplayId: "",
    });
    expect(assist.direction).toBe("");
    expect(assist.mission_type).toBe("Stickering");
    expect(assist.dicos_ref).toBe("");
  });
});

// Dossier DICOS fictif (trip-details) : aller en train Gembloux → Namur → Liège le 10/10, retour en taxi le 14/10.
const dossier = {
  id: "x",
  displayId: "2026-10-02-0001",
  type: "Disabled",
  status: "Confirmed",
  description: { fr: "1 chaise roulante fixe\nAller-retour" },
  client: {
    firstName: "Exemple",
    lastName: "Fictif",
    email: "exemple@invalid.test",
    language: "French",
  },
  missions: [
    { journeyId: "11", status: "Completed", owner: { name: "Agent fictif" } },
    { journeyId: "12", status: "Planned" },
    { journeyId: "21", status: "Deleted" },
  ],
  travels: [
    {
      travelDate: "2026-10-10T00:00:00",
      meetingPoint: [{ language: "French", text: "Guichet" }],
      traveler: {
        quantity: 1,
        disableds: [{ typeId: "pmr-wc", symbol: "fixed-wheelchair", quantity: 1 }],
      },
      journeys: [
        {
          id: 11,
          departureName: "GEMBLOUX / GEMBLOERS",
          departureTime: "2026-10-10T08:01:00",
          arrivalName: "NAMUR / NAMEN",
          arrivalTime: "2026-10-10T08:15:00",
          withDepartureAssistance: true,
          withArrivalAssistance: false,
          trainNumber: 2112,
          transportType: "Train",
          coachNumber: "3",
        },
        {
          id: 12,
          departureName: "NAMUR / NAMEN",
          departureTime: "2026-10-10T08:30:00",
          arrivalName: "LIÈGE-GUILLEMINS / LUIK-GUILLEMINS",
          arrivalTime: "2026-10-10T09:20:00",
          withDepartureAssistance: false,
          withArrivalAssistance: true,
          trainNumber: 2312,
        },
      ],
    },
    {
      travelDate: "2026-10-14T00:00:00",
      traveler: {
        quantity: 1,
        disableds: [{ typeId: "pmr-wc", symbol: "fixed-wheelchair", quantity: 1 }],
      },
      journeys: [
        {
          id: 21,
          departureName: "LIÈGE-GUILLEMINS / LUIK-GUILLEMINS",
          departureTime: "2026-10-14T17:00:00",
          arrivalName: "GEMBLOUX / GEMBLOERS",
          arrivalTime: "2026-10-14T18:10:00",
          withDepartureAssistance: true,
          withArrivalAssistance: true,
          transportType: "Taxi",
          transportId: "TAXI-1",
          trainNumber: 0,
        },
      ],
    },
  ],
};

describe("mapDossier (trip-details, une ligne par trajet)", () => {
  it("un trajet = une ligne avec départ ET arrivée, IN/OUT, districts", () => {
    const { legs } = mapDossier(dossier);
    expect(legs).toHaveLength(3);
    const [a, b] = legs.map((l) => l.assist);
    expect(a).toMatchObject({
      dicos_id: "11",
      day: "2026-10-10",
      time: "08:01",
      station: "GEMBLOUX",
      district: "DSE",
      other_station: "NAMUR",
      arr_time: "08:15",
      arr_district: "DSE",
      in_assist: true,
      out_assist: false,
      transport: "train",
      train: "2112",
      dicos_ref: "2026-10-02-0001",
      pax: 1,
      pmr_type: "CRF",
      status: "realisee",
    });
    expect(b).toMatchObject({
      dicos_id: "12",
      in_assist: false,
      out_assist: true,
      status: "prevue",
    });
    expect(b?.other_station).toBe("LIÈGE-GUILLEMINS");
  });

  it("retour en taxi sur un autre jour, annulé", () => {
    const leg = mapDossier(dossier).legs[2];
    expect(leg?.assist).toMatchObject({
      day: "2026-10-14",
      transport: "taxi",
      train: "TAXI-1",
      in_assist: true,
      out_assist: true,
      status: "annulee",
    });
    expect(leg?.mission.driver_name).toBe("TAXI-1");
  });

  it("détail nominatif commun au dossier", () => {
    const { mission } = mapDossier(dossier).legs[0]!;
    expect(mission).toMatchObject({
      reservation_type: "Disabled",
      client_last: "Fictif",
      client_email: "exemple@invalid.test",
      meeting_point: "Guichet",
      coach: "3",
      owner_name: "Agent fictif",
    });
    expect(mission.client_desc).toContain("chaise roulante fixe");
  });

  it("dossier vide ou invalide", () => {
    expect(mapDossier({}).legs).toEqual([]);
    expect(() => mapDossier("x")).toThrow();
  });
});
