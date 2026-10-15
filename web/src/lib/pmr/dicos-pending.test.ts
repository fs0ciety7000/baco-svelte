import { describe, expect, it } from "vitest";

import {
  mapPendingDossier,
  nextPlannerStatus,
  pendingStatus,
  tasksFromAssist,
  trainInstant,
  travelers,
  type AssistForPlanner,
} from "./dicos-pending";

// Dossier FICTIF, à la forme de la liste DICOS « à vérifier » relevée le 15 oct. 2026 (champs réduits par l'extension).
const dossier = (over: Record<string, unknown> = {}) => ({
  id: "2099-03-02-0042",
  displayId: "2099-03-02-0042",
  status: "Proposal",
  travels: [
    {
      travelDate: "2099-03-02T00:00:00+01:00",
      disableds: [{ symbol: "blind-person", assistanceType: "Light", quantity: 1 }],
      journeys: [
        {
          id: "990001",
          trainNumber: "1234",
          departureName: "BRUXELLES-MIDI / BRUSSEL-ZUID",
          arrivalName: "MONS / BERGEN",
          departureUicCode: "8814001",
          arrivalUicCode: "8881000",
          departureTime: "2099-03-02T07:16:00+01:00",
          arrivalTime: "2099-03-02T08:08:00+01:00",
          withDepartureAssistance: true,
          withArrivalAssistance: true,
          isDepartureOk: true,
          isArrivalOk: null,
          isTrainCancelled: false,
        },
        {
          id: "990002",
          trainNumber: "5678",
          departureName: "MONS / BERGEN",
          arrivalName: "TOURNAI / DOORNIK",
          departureTime: "2099-03-02T08:30:00+01:00",
          arrivalTime: "2099-03-02T09:20:00+01:00",
          withDepartureAssistance: true,
          withArrivalAssistance: false,
          isDepartureOk: null,
          isArrivalOk: null,
          isTrainCancelled: false,
        },
      ],
    },
  ],
  ...over,
});

describe("dossiers DICOS en attente → tâches du planificateur", () => {
  it("une tâche par bout assisté, IN au départ, OUT à l'arrivée", () => {
    const t = mapPendingDossier(dossier());
    expect(t.map((x) => x.source_key)).toEqual(["990001:IN", "990001:OUT", "990002:IN"]);
    expect(t[0]).toMatchObject({
      kind: "pmr_in",
      day: "2099-03-02",
      station: "BRUXELLES-MIDI",
      station_key: "bruxelles midi",
      other_station: "MONS",
      train: "1234",
      pmr_type: "NV",
      pax: 1,
      light: true,
      dossier: "2099-03-02-0042",
      dicos_status: "proposal",
      station_ok: "ok",
    });
    expect(t[1]).toMatchObject({ kind: "pmr_out", station: "MONS", station_ok: "pending" });
  });

  it("début = fin = heure du train à la gare assistée (instant UTC ; fenêtre calculée à l'affichage)", () => {
    const [inTask, outTask] = mapPendingDossier(dossier());
    expect(inTask!.start).toBe("2099-03-02T06:16:00.000Z");
    expect(inTask!.end).toBe(inTask!.start);
    expect(outTask!.start).toBe("2099-03-02T07:08:00.000Z");
  });

  it("dossier annulé ou train supprimé → annulé", () => {
    expect(
      mapPendingDossier(dossier({ status: "Cancelled" })).every(
        (t) => t.dicos_status === "cancelled",
      ),
    ).toBe(true);
    const d = dossier();
    (d.travels[0]!.journeys[1] as { isTrainCancelled: boolean }).isTrainCancelled = true;
    const t = mapPendingDossier(d);
    expect(t.map((x) => x.dicos_status)).toEqual(["proposal", "proposal", "cancelled"]);
    expect(pendingStatus("Proposal")).toBe("proposal");
    expect(pendingStatus("cancelled")).toBe("cancelled");
  });

  it("ignore les heures vides (0001-01-01), les trajets sans id et un corps invalide", () => {
    const d = dossier();
    d.travels[0]!.journeys[0]!.departureTime = "0001-01-01T00:00:00+00:00";
    (d.travels[0]!.journeys[1] as { id: string }).id = "";
    expect(mapPendingDossier(d).map((x) => x.source_key)).toEqual(["990001:OUT"]);
    expect(mapPendingDossier(null)).toEqual([]);
    expect(mapPendingDossier({ travels: "x" })).toEqual([]);
    expect(trainInstant("")).toBeNull();
  });

  it("ne reprend jamais de donnée nominative", () => {
    const d = { ...dossier(), client: { lastName: "Exemple", phone: "0400" }, remarks: "Quai 1" };
    const json = JSON.stringify(mapPendingDossier(d));
    expect(json).not.toContain("Exemple");
    expect(json).not.toContain("0400");
    expect(json).not.toContain("Quai 1");
  });

  it("voyageurs : fauteuil prioritaire, quantités additionnées, light seulement sans « Full »", () => {
    expect(
      travelers([
        { symbol: "reduced-mobility", assistanceType: "Light", quantity: 2 },
        { symbol: "fixed-wheelchair", assistanceType: "Full", quantity: 1 },
      ]),
    ).toEqual({ pmr_type: "CRF", pax: 3, light: false });
    expect(
      travelers([{ symbol: "orientation-problems", assistanceType: "Light", quantity: null }]),
    ).toEqual({
      pmr_type: "DCO",
      pax: 1,
      light: true,
    });
    expect(travelers([{ symbol: "inconnu", assistanceType: "Light", quantity: 1 }]).pmr_type).toBe(
      "AUTRE",
    );
    // Forme brute (`traveler.disableds`) acceptée.
    const d = dossier();
    const t0 = d.travels[0]! as Record<string, unknown>;
    t0.traveler = {
      disableds: [{ symbol: "electric-wheelchair", assistanceType: "Full", quantity: 1 }],
    };
    delete t0.disableds;
    expect(mapPendingDossier(d)[0]).toMatchObject({ pmr_type: "CRE", light: false });
  });
});

const assist = (over: Partial<AssistForPlanner> = {}): AssistForPlanner => ({
  id: "a1",
  dicos_id: "j990001",
  day: "2099-03-02",
  time: "07:16",
  arr_time: "08:08",
  station: "BRUXELLES-MIDI",
  other_station: "MONS",
  in_assist: true,
  out_assist: true,
  train: "1234",
  transport: "train",
  pmr_type: "NV",
  pax: 1,
  full_pax: 0,
  light_pax: 1,
  dicos_ref: "2099-03-02-0042",
  status: "prevue",
  in_status: "prevue",
  out_status: "prevue",
  ...over,
});

describe("missions acceptées → tâches (même clé que le dossier en attente)", () => {
  it("clés <journeyId>:IN|OUT, statut DICOS accepté, gare vérifiée", () => {
    const t = tasksFromAssist(assist());
    expect(t.map((x) => x.source_key)).toEqual(["990001:IN", "990001:OUT"]);
    expect(t[0]).toMatchObject({
      station: "BRUXELLES-MIDI",
      start: "2099-03-02T06:16:00.000Z",
      light: true,
    });
    expect(t[1]).toMatchObject({
      station: "MONS",
      other_station: "BRUXELLES-MIDI",
      dicos_status: "accepted",
      station_ok: "ok",
    });
  });

  it("arrivée après minuit = lendemain ; taxi ; bout annulé", () => {
    const t = tasksFromAssist(assist({ time: "23:30", arr_time: "00:20", out_status: "annulee" }));
    expect(t[1]).toMatchObject({ day: "2099-03-03", cancelled: true, dicos_status: "cancelled" });
    expect(t[0]).toMatchObject({ cancelled: false });
    expect(tasksFromAssist(assist({ transport: "taxi", train: "" }))[0]!.train).toBe("TAXI");
  });

  it("light d'après les compteurs, sinon le type ; anciennes clés et bouts non assistés ignorés", () => {
    expect(tasksFromAssist(assist({ full_pax: 1, light_pax: 0 }))[0]!.light).toBe(false);
    expect(tasksFromAssist(assist({ full_pax: 0, light_pax: 0, pmr_type: "CRF" }))[0]!.light).toBe(
      false,
    );
    expect(tasksFromAssist(assist({ full_pax: 0, light_pax: 0, pmr_type: "MR" }))[0]!.light).toBe(
      true,
    );
    expect(tasksFromAssist(assist({ dicos_id: "12345" }))).toEqual([]);
    expect(tasksFromAssist(assist({ out_assist: false })).map((x) => x.kind)).toEqual(["pmr_in"]);
  });
});

describe("statut après une synchro (attribution jamais retirée)", () => {
  it("annulation garde l'agent, rétablissement selon la destination, « faite » reste faite", () => {
    expect(nextPlannerStatus("attribuee", true, true)).toBe("annulee");
    expect(nextPlannerStatus("a_attribuer", true, false)).toBe("annulee");
    expect(nextPlannerStatus("annulee", false, true)).toBe("attribuee");
    expect(nextPlannerStatus("annulee", false, false)).toBe("a_attribuer");
    expect(nextPlannerStatus("faite", true, true)).toBe("faite");
    expect(nextPlannerStatus("attribuee", false, true)).toBe("attribuee");
    expect(nextPlannerStatus("", false, false)).toBe("a_attribuer");
  });
});
