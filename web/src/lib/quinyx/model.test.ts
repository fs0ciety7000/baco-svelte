import { describe, expect, it } from "vitest";

import {
  pickDutyShift,
  currentShift,
  isCapturedCode,
  isStationCode,
  stationBase,
  stationPost,
  mapQuinyxBatch,
  placeDistrict,
  quinyxBatchSchema,
  shiftKind,
  suggestUser,
  type QuinyxBatch,
  removalAllowed,
  isTeamAccount,
  brusselsClock,
  weekDays,
  weekRows,
} from "./model";

// Données FICTIVES (identifiants et noms inventés) : la forme suit les réponses Quinyx relevées le 14 oct. 2026.
const PLACES = [
  { pattern: "MONS", district: "DSO" },
  { pattern: "OCC SO", district: "DSO" },
  { pattern: "NAMUR", district: "DSE" },
  { pattern: "OCC SE", district: "DSE" },
];

function batch(over: Partial<QuinyxBatch> = {}): QuinyxBatch {
  return quinyxBatchSchema.parse({
    group: "111",
    from: "2026-10-01",
    to: "2026-10-31",
    publishedUntil: "2026-10-19",
    unit: "Operations OCC Test",
    sections: [
      { id: 111, name: "Operations OCC Test" },
      { id: 211, name: "PACO Mons" },
      { id: 212, name: "RCCA Mons" },
    ],
    types: [
      { id: 1, name: "PACO_AM" },
      { id: 2, name: "PACO_N" },
      { id: 3, name: "RCCA_PM" },
      { id: 4, name: "EXTRA - OCC SO" },
      { id: 5, name: "RW/RH - Wekelijkse rust/Repos Hebdo" },
      { id: 6, name: "IDEWE" },
    ],
    employees: [
      { id: 901, firstname: "Alice", lastname: "Exemple" },
      { id: 902, firstname: "Bruno", lastname: "Fictif" },
    ],
    shifts: [
      {
        id: 1,
        groupId: 211,
        begin: "2026-10-05T06:00:00",
        end: "2026-10-05T14:00:00",
        shiftTypeId: 1,
        employeeId: 901,
        status: "ASSIGNED",
      },
      {
        id: 2,
        groupId: 211,
        begin: "2026-10-05T22:00:00",
        end: "2026-10-06T06:00:00",
        shiftTypeId: 2,
        employeeId: 902,
        status: "ASSIGNED",
      },
      {
        id: 3,
        groupId: 212,
        begin: "2026-10-06T14:00:00",
        end: "2026-10-06T22:00:00",
        shiftTypeId: 3,
        employeeId: 0,
        status: "UNASSIGNED",
      },
      {
        id: 4,
        groupId: 111,
        begin: "2026-10-07T09:00:00",
        end: "2026-10-07T17:00:00",
        shiftTypeId: 4,
        employeeId: 901,
        status: "ASSIGNED",
      },
      {
        id: 5,
        groupId: 111,
        begin: "2026-10-08T08:00:00",
        end: "2026-10-08T16:00:00",
        shiftTypeId: 5,
        employeeId: 901,
        status: "ASSIGNED",
      },
      {
        id: 6,
        groupId: 111,
        begin: "2026-10-09T08:00:00",
        end: "2026-10-09T12:00:00",
        shiftTypeId: 6,
        employeeId: 902,
        status: "ASSIGNED",
      },
      {
        id: 7,
        groupId: 211,
        begin: "2026-10-20T06:00:00",
        end: "2026-10-20T14:00:00",
        shiftTypeId: 1,
        employeeId: 901,
        status: "ASSIGNED",
      },
    ],
    ...over,
  });
}

describe("prestations Quinyx captées", () => {
  it("PACO / RCCA / EXTRA seulement", () => {
    expect(isCapturedCode("PACO_AM")).toBe(true);
    expect(isCapturedCode("RCCA_PM")).toBe(true);
    expect(isCapturedCode("PACO_N")).toBe(true);
    expect(isCapturedCode("EXTRA - OCC SO")).toBe(true);
    expect(isCapturedCode("RW/RH - Wekelijkse rust/Repos Hebdo")).toBe(false);
    expect(isCapturedCode("IDEWE")).toBe(false);
    expect(isCapturedCode("Extra Shift B-MS - Day")).toBe(true);
    expect(isCapturedCode("TRAINING")).toBe(false);
  });

  it("type de service", () => {
    expect(shiftKind("PACO_AM")).toBe("am");
    expect(shiftKind("RCCA_PM")).toBe("pm");
    expect(shiftKind("PACO_N")).toBe("nuit");
    expect(shiftKind("EXTRA - OCC SO", "09:00")).toBe("extra");
    expect(shiftKind("PACO_X", "05:30")).toBe("am");
    expect(shiftKind("PACO_X", "22:00")).toBe("nuit");
    expect(shiftKind("PACO_X")).toBe("autre");
  });

  it("district par le motif le plus long, en mots entiers", () => {
    expect(placeDistrict("PACO_AM PACO Mons", PLACES)).toBe("DSO");
    expect(placeDistrict("EXTRA - OCC SO", PLACES)).toBe("DSO");
    expect(placeDistrict("EXTRA - OCC SE", [...PLACES, { pattern: "OCC", district: "DCE" }])).toBe(
      "DSE",
    );
    expect(placeDistrict("RCCA_AM RCCA Namur", PLACES)).toBe("DSE");
    expect(placeDistrict("PACO_AM PACO Monsieur", PLACES)).toBe("");
    expect(placeDistrict("PACO_AM", [{ pattern: "PACO", district: "XXX" }])).toBe("");
  });
});

describe("conversion d'un lot", () => {
  it("ne garde que les prestations affectées, captées et publiées", () => {
    const r = mapQuinyxBatch(batch(), PLACES);
    expect(r.shifts.map((s) => s.quinyx_id)).toEqual(["1", "2", "4"]);
    expect(r.ignored).toBe(4); // non affectée, repos, visite médicale, non publiée (20 oct. > 19 oct.)
    expect(r.agents.map((a) => a.quinyx_id).sort()).toEqual(["901", "902"]);
  });

  it("heures de Bruxelles converties en UTC, nuit sur deux jours", () => {
    const [am, nuit, extra] = mapQuinyxBatch(batch(), PLACES).shifts;
    expect(am).toMatchObject({
      day: "2026-10-05",
      start: "2026-10-05T04:00:00.000Z",
      end: "2026-10-05T12:00:00.000Z",
      kind: "am",
      section: "PACO Mons",
      district: "DSO",
    });
    expect(nuit).toMatchObject({
      day: "2026-10-05",
      start: "2026-10-05T20:00:00.000Z",
      end: "2026-10-06T04:00:00.000Z",
      kind: "nuit",
    });
    // Prestation du groupe lui-même : pas de section ; district par le code.
    expect(extra).toMatchObject({
      section: "",
      kind: "extra",
      district: "DSO",
      code: "EXTRA - OCC SO",
    });
  });

  it("district par défaut du groupe si aucun lieu ne correspond", () => {
    const r = mapQuinyxBatch(batch(), [], "DCE");
    expect(r.shifts.every((s) => s.district === "DCE")).toBe(true);
    expect(mapQuinyxBatch(batch(), [], "").shifts[0]!.district).toBe("");
  });

  it("refuse un lot mal formé", () => {
    expect(quinyxBatchSchema.safeParse({ ...batch(), group: "abc" }).success).toBe(false);
    expect(quinyxBatchSchema.safeParse({ ...batch(), shifts: [{ id: 1 }] }).success).toBe(false);
  });
});

describe("correspondance des comptes", () => {
  const users = [
    { id: "u1", name: "Alice EXEMPLE" },
    { id: "u2", name: "Bruno Fictif" },
    { id: "u3", name: "Bruno Fictif" },
    { id: "u4", name: "Élodie Démo" },
  ];
  it("nom complet identique, ordre et accents ignorés, une seule correspondance", () => {
    expect(suggestUser({ first_name: "Alice", last_name: "Exemple" }, users)).toBe("u1");
    expect(suggestUser({ first_name: "Exemple", last_name: "Alice" }, users)).toBe("u1");
    expect(suggestUser({ first_name: "Elodie", last_name: "DEMO" }, users)).toBe("u4");
    expect(suggestUser({ first_name: "Bruno", last_name: "Fictif" }, users)).toBe(""); // deux comptes
    expect(suggestUser({ first_name: "Alice", last_name: "" }, users)).toBe("");
  });
});

describe("prestation en cours", () => {
  it("en cours, sinon la prochaine", () => {
    const list = [
      { start: "2026-10-05T12:00:00.000Z", end: "2026-10-05T20:00:00.000Z" },
      { start: "2026-10-05T04:00:00.000Z", end: "2026-10-05T12:00:00.000Z" },
    ];
    expect(currentShift(list, new Date("2026-10-05T05:00:00Z"))).toBe(list[1]);
    expect(currentShift(list, new Date("2026-10-05T02:00:00Z"))).toBe(list[1]);
    expect(currentShift(list, new Date("2026-10-05T21:00:00Z"))).toBeNull();
  });
});

describe("vue planning", () => {
  it("semaine du lundi au dimanche", () => {
    expect(weekDays("2026-10-14")).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
    expect(weekDays("2026-10-18")[0]).toBe("2026-10-12");
    expect(weekDays("2026-10-19")[0]).toBe("2026-10-19");
  });
  it("heure de Bruxelles", () => {
    expect(brusselsClock("2026-10-05T04:00:00.000Z")).toBe("06:00");
    expect(brusselsClock("2026-12-05T21:00:00.000Z")).toBe("22:00");
  });
  it("une ligne par agent, triée par nom", () => {
    const rows = weekRows([
      { agentId: "b", name: "Bruno", day: "2026-10-12" },
      { agentId: "a", name: "Alice", day: "2026-10-12" },
      { agentId: "a", name: "Alice", day: "2026-10-13" },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Alice", "Bruno"]);
    expect(rows[0]!.byDay.get("2026-10-13")).toHaveLength(1);
  });
});

describe("bornes du lot", () => {
  it("heure invalide refusée, durée > 24 h ignorée", () => {
    const b = batch();
    expect(
      quinyxBatchSchema.safeParse({
        ...b,
        shifts: [{ ...b.shifts[0]!, begin: "2026-10-05T99:99:00" }],
      }).success,
    ).toBe(false);
    const long = batch({ shifts: [{ ...b.shifts[0]!, end: "2026-10-07T14:00:00" }] });
    expect(mapQuinyxBatch(long, PLACES).shifts).toHaveLength(0);
  });
});

describe("retrait des prestations disparues", () => {
  it("5 au plus sur une petite période, 30 % au-delà", () => {
    expect(removalAllowed(8, 5)).toBe(true);
    expect(removalAllowed(8, 6)).toBe(false);
    expect(removalAllowed(400, 120)).toBe(true);
    expect(removalAllowed(400, 397)).toBe(false);
  });
});

describe("comptes de l'équipe", () => {
  it("PACO/RCCA, modérateur, admin ; jamais invité, écran ni connecteur (sans perms : rôles)", () => {
    expect(["paco", "moderator", "admin", "sysop"].every((role) => isTeamAccount({ role }))).toBe(
      true,
    );
    expect(
      ["guest", "screen", "connector", "disabled", "", undefined].some((role) =>
        isTeamAccount({ role }),
      ),
    ).toBe(false);
  });

  it("rôles v3 : `quinyx:read` dans perms décide", () => {
    expect(isTeamAccount({ role: "guest", perms: ["quinyx:read"] })).toBe(true);
    expect(isTeamAccount({ role: "paco", perms: ["otto:read"] })).toBe(false);
    expect(isTeamAccount({ role: "screen", perms: ["quinyx:read"] })).toBe(false);
  });
});

describe("date de publication", () => {
  it("le jour de publication est inclus", () => {
    const r = mapQuinyxBatch(batch({ publishedUntil: "2026-10-20" }), PLACES);
    expect(r.shifts.map((s) => s.quinyx_id)).toContain("7");
  });
});

describe("quinyxGroupId", () => {
  it("prend le numéro après /schedule/, paramètres de la vue compris", async () => {
    const { quinyxGroupId } = await import("./model");
    expect(
      quinyxGroupId(
        "https://web.quinyx.com/schedule/990123?end=2026-11-30&start=2026-11-01&timeframe=multiday_month",
      ),
    ).toBe("990123");
    expect(quinyxGroupId("https://web.quinyx.com/schedule/990123/")).toBe("990123");
    expect(quinyxGroupId(" 990123 ")).toBe("990123");
    expect(quinyxGroupId("Mons")).toBe("Mons");
  });
});

describe("districts du jour d'après Quinyx", () => {
  // Heures UTC (octobre : Bruxelles = UTC+2).
  const night = {
    day: "2026-10-15",
    start: "2026-10-15T20:00:00Z",
    end: "2026-10-16T04:00:00Z",
    d: "DSO",
  };
  const am = {
    day: "2026-10-15",
    start: "2026-10-15T04:00:00Z",
    end: "2026-10-15T12:00:00Z",
    d: "DSE",
  };
  it("prend la prestation à venir du jour (nuit de 22:00 vue l'après-midi)", () => {
    expect(pickDutyShift([night], Date.parse("2026-10-15T13:00:00Z"), "2026-10-15")?.d).toBe("DSO");
  });
  it("garde la nuit de la veille tant qu'elle dure, après minuit", () => {
    expect(pickDutyShift([night], Date.parse("2026-10-16T02:00:00Z"), "2026-10-16")?.d).toBe("DSO");
  });
  it("prend la prestation en cours (AM dès 6:00)", () => {
    expect(pickDutyShift([am, night], Date.parse("2026-10-15T05:00:00Z"), "2026-10-15")?.d).toBe(
      "DSE",
    );
  });
  it("après la dernière prestation du jour, la garde ; aucune = rien", () => {
    expect(pickDutyShift([am], Date.parse("2026-10-15T15:00:00Z"), "2026-10-15")?.d).toBe("DSE");
    expect(pickDutyShift([], Date.now(), "2026-10-15")).toBeNull();
  });
});

describe("groupes « gares » (planificateur PMR)", () => {
  // Bases et groupe FICTIFS (identifiants 990xxx, agents « Agent Test »).
  const BASES = [
    { code: "FMS", name: "Mons", district: "DSO" },
    { code: "FTY", name: "Tournai", district: "DSO" },
    { code: "FBC", name: "Braine-le-Comte", district: "DSO" },
    { code: "FL", name: "Liège-Guillemins", district: "DSE" },
    { code: "GV", name: "Verviers-Central", district: "DSE" },
    { code: "LT", name: "Ottignies", district: "DSE" },
  ];
  const shift = (id: number, type: number, section: number, begin: string, end: string) => ({
    id,
    groupId: section,
    begin,
    end,
    shiftTypeId: type,
    employeeId: 990101 + (id % 3),
    status: "ASSIGNED",
  });
  const gares = () =>
    quinyxBatchSchema.parse({
      group: "990100",
      from: "2026-10-01",
      to: "2026-10-31",
      publishedUntil: "2026-10-31",
      unit: "Gare test",
      sections: [
        { id: 990100, name: "Gare test" },
        { id: 990111, name: "CPI MONS" },
        { id: 990112, name: "OPI Mons" },
        { id: 990113, name: "PA Mons" },
        { id: 990114, name: "SPI Liège" },
        { id: 990115, name: "CPI VERVIERS" },
      ],
      types: [
        { id: 1, name: "CPI_AM" },
        { id: 2, name: "CPI_N" },
        { id: 3, name: "OPI 6-14" },
        { id: 4, name: "PA_PM" },
        { id: 5, name: "EXTRA CPI" },
        { id: 6, name: "SPI_PM" },
        { id: 7, name: "RW/RH - Repos" },
        { id: 8, name: "ADA" },
        { id: 9, name: "PACO_AM" },
      ],
      employees: [
        { id: 990101, firstname: "Agent", lastname: "Test A." },
        { id: 990102, firstname: "Agent", lastname: "Test B." },
        { id: 990103, firstname: "Agent", lastname: "Test C." },
      ],
      shifts: [
        shift(1, 1, 990111, "2026-10-05T06:00:00", "2026-10-05T14:00:00"),
        shift(2, 2, 990111, "2026-10-05T22:00:00", "2026-10-06T06:00:00"),
        // OPI décalé : les heures réelles font foi (05-13), pas celles du type (6-14).
        shift(3, 3, 990112, "2026-10-05T05:00:00", "2026-10-05T13:00:00"),
        shift(4, 4, 990113, "2026-10-05T14:00:00", "2026-10-05T22:00:00"),
        shift(5, 5, 990112, "2026-10-06T06:00:00", "2026-10-06T14:00:00"),
        shift(6, 6, 990114, "2026-10-06T14:00:00", "2026-10-06T22:00:00"),
        shift(7, 1, 990115, "2026-10-06T06:00:00", "2026-10-06T14:00:00"),
        shift(8, 7, 990111, "2026-10-07T00:00:00", "2026-10-07T23:59:00"),
        shift(9, 8, 990111, "2026-10-07T06:00:00", "2026-10-07T14:00:00"),
        shift(10, 9, 990111, "2026-10-07T06:00:00", "2026-10-07T14:00:00"),
      ],
    });

  it("capte CPI / SPI / OPI / PA / EXTRA, ignore repos, absences et PACO", () => {
    for (const c of ["CPI_AM", "CPI_N", "SPI_PM", "OPI 6-14", "OPI 14-22", "PA_AM", "EXTRA CPI"])
      expect(isStationCode(c), c).toBe(true);
    for (const c of ["RW", "CW", "CV", "RR", "ADA", "IDEV", "PACO_AM", "RCCA_PM", "PAUSE", ""])
      expect(isStationCode(c), c).toBe(false);
    expect(stationPost("EXTRA CPI")).toBe("EXTRA");
    expect(stationPost("OPI 14-22")).toBe("OPI");
    expect(stationPost("PA_AM")).toBe("PA");
    expect(stationPost("RW")).toBe("");
  });

  it("gare de base d'après la section, tolérante", () => {
    expect(stationBase("CPI MONS", BASES)?.code).toBe("FMS");
    expect(stationBase("OPI Mons", BASES)?.code).toBe("FMS");
    expect(stationBase("SPI Liège", BASES)?.code).toBe("FL");
    expect(stationBase("SPI LIEGE-GUILLEMINS", BASES)?.code).toBe("FL");
    expect(stationBase("CPI VERVIERS", BASES)?.code).toBe("GV");
    expect(stationBase("PA Braine", BASES)?.code).toBe("FBC");
    expect(stationBase("CPI LT", BASES)?.code).toBe("LT");
    expect(stationBase("Gare de Tournai", BASES)?.code).toBe("FTY");
    expect(stationBase("CPI", BASES)).toBeNull();
    expect(stationBase("OCC SO", BASES)).toBeNull();
  });

  it("garde poste, base, district de la base et heures réelles", () => {
    const r = mapQuinyxBatch(gares(), PLACES, "", { purpose: "gares", bases: BASES });
    expect(r.shifts.map((s) => s.quinyx_id)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(r.ignored).toBe(3);
    const by = Object.fromEntries(r.shifts.map((s) => [s.quinyx_id, s]));
    expect(by["1"]).toMatchObject({ post: "CPI", base: "Mons", district: "DSO", kind: "am" });
    expect(by["2"]).toMatchObject({ post: "CPI", base: "Mons", kind: "nuit" });
    expect(by["3"]).toMatchObject({
      post: "OPI",
      base: "Mons",
      start: "2026-10-05T03:00:00.000Z",
      end: "2026-10-05T11:00:00.000Z",
    });
    expect(by["4"]).toMatchObject({ post: "PA", kind: "pm" });
    expect(by["5"]).toMatchObject({ post: "EXTRA", base: "Mons", kind: "extra" });
    expect(by["6"]).toMatchObject({ post: "SPI", base: "Liège-Guillemins", district: "DSE" });
    expect(by["7"]).toMatchObject({ post: "CPI", base: "Verviers-Central", district: "DSE" });
  });

  it("un groupe « équipe » ignore les postes de gare (comportement inchangé)", () => {
    const r = mapQuinyxBatch(gares(), PLACES, "", { purpose: "equipe", bases: BASES });
    // « EXTRA… » reste capté pour l'équipe (règle du 14 oct.) ; PACO_AM aussi ; aucun poste ni base.
    expect(r.shifts.map((s) => s.quinyx_id)).toEqual(["5", "10"]);
    expect(r.shifts.every((s) => s.post === "" && s.base === "")).toBe(true);
    expect(
      mapQuinyxBatch(batch(), PLACES).shifts.every((s) => s.post === "" && s.base === ""),
    ).toBe(true);
  });
});
