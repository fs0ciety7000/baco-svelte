import { describe, expect, it } from "vitest";

import {
  frName,
  frText,
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
