import { describe, expect, it } from "vitest";

import {
  alignRows,
  coverDistrict,
  mapCovers,
  mapOpenShifts,
  openFilterQuery,
  openFunction,
  openKindsFor,
  openPeriod,
  openPeriodLabel,
  parseOpenFilter,
  quinyxBatchSchema,
  type QuinyxBatch,
} from "./model";
import {
  coverText,
  openCells,
  openCsv,
  openFileName,
  openTotals,
  weekday,
  type OpenRow,
} from "./open-export";
import { openFilterText } from "./open-filter-text";

// Données FICTIVES : services Quinyx sans agent (« non pourvus »), même forme que le planning publié.
const PLACES = [
  { pattern: "MONS", district: "DSO" },
  { pattern: "NAMUR", district: "DSE" },
];

function batch(over: Partial<QuinyxBatch> = {}): QuinyxBatch {
  return quinyxBatchSchema.parse({
    group: "111",
    from: "2026-10-01",
    to: "2026-10-31",
    publishedUntil: "2026-10-19",
    unit: "Operations OCC Test",
    sections: [
      { id: 211, name: "PACO Mons" },
      { id: 212, name: "RCCA Mons" },
    ],
    types: [
      { id: 1, name: "PACO_AM" },
      { id: 2, name: "PACO_N" },
      { id: 3, name: "EXTRA - OCC SO" },
      { id: 4, name: "PACO 10-18" },
    ],
    employees: [],
    shifts: [],
    open: [
      {
        id: 11,
        groupId: 211,
        begin: "2026-10-05T06:00:00",
        end: "2026-10-05T14:00:00",
        shiftTypeId: 1,
        status: "UNASSIGNED",
      },
      {
        id: 12,
        groupId: 212,
        begin: "2026-10-05T22:00:00",
        end: "2026-10-06T06:00:00",
        shiftTypeId: 2,
      },
      {
        id: 13,
        groupId: 111,
        begin: "2026-10-06T09:00:00",
        end: "2026-10-06T17:00:00",
        shiftTypeId: 3,
      },
      {
        id: 14,
        groupId: 211,
        begin: "2026-10-20T06:00:00",
        end: "2026-10-20T14:00:00",
        shiftTypeId: 1,
      },
      {
        id: 15,
        groupId: 211,
        begin: "2026-10-07T06:00:00",
        end: "2026-10-07T14:00:00",
        shiftTypeId: 1,
        status: "DELETED",
      },
      {
        id: 16,
        groupId: 211,
        begin: "2026-10-08T10:00:00",
        end: "2026-10-08T18:00:00",
        shiftTypeId: 4,
      },
    ],
    ...over,
  });
}

describe("services non alignés : conversion", () => {
  it("fonction PACO / RCCA d'après le type, rien pour EXTRA", () => {
    expect(openFunction("PACO_AM")).toBe("paco");
    expect(openFunction("RCCA_PM")).toBe("rcca");
    expect(openFunction("EXTRA - OCC SO")).toBe("");
    expect(openFunction("PACOX")).toBe("");
  });

  it("garde PACO / RCCA publiés, écarte EXTRA, après publication et supprimés", () => {
    const { shifts, ignored } = mapOpenShifts(batch(), PLACES, "DSO");
    expect(shifts.map((s) => s.quinyx_id)).toEqual(["11", "12", "16"]);
    expect(ignored).toBe(3);
    const [am, nuit, other] = shifts;
    expect(am).toMatchObject({
      function: "paco",
      kind: "am",
      section: "PACO Mons",
      district: "DSO",
      day: "2026-10-05",
    });
    expect(am!.start).toBe("2026-10-05T04:00:00.000Z"); // 06:00 heure d'été de Bruxelles
    expect(nuit).toMatchObject({
      function: "paco",
      kind: "nuit",
      section: "RCCA Mons",
      day: "2026-10-05",
    });
    expect(other).toMatchObject({ function: "paco", kind: "pm" }); // « PACO 10-18 » : type d'après l'heure
  });

  it("lot sans `open` (extension < 1.11.0) : rien", () => {
    expect(mapOpenShifts(batch({ open: undefined }), PLACES).shifts).toEqual([]);
  });

  it("durée invalide écartée", () => {
    const b = batch({
      open: [
        {
          id: "20",
          groupId: "211",
          begin: "2026-10-05T14:00:00",
          end: "2026-10-05T06:00:00",
          shiftTypeId: "1",
        },
      ],
    });
    expect(mapOpenShifts(b, PLACES)).toMatchObject({ shifts: [], ignored: 1 });
  });
});

describe("services non alignés : filtres", () => {
  const params = (q: string) => new URLSearchParams(q);

  it("par défaut : mois en cours", () => {
    expect(parseOpenFilter(params(""), "2026-10-23")).toEqual({
      year: 2026,
      month: 10,
      groups: [],
      functions: [],
      kinds: [],
      statuses: [],
    });
  });

  it("année entière, zones, fonctions, types ; valeurs inconnues écartées", () => {
    const f = parseOpenFilter(
      params(
        "annee=2025&mois=0&zone=111&zone=abc&fonction=RCCA,x&type=nuit&type=extra&couverture=fusion,x",
      ),
      "2026-10-23",
    );
    expect(f).toEqual({
      year: 2025,
      month: 0,
      groups: ["111"],
      functions: ["rcca"],
      kinds: ["nuit"],
      statuses: ["fusion"],
    });
    expect(parseOpenFilter(params(openFilterQuery(f)), "2026-10-23")).toEqual(f);
  });

  it("bornes d'un mois et d'une année", () => {
    expect(openPeriod(2026, 2)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(openPeriod(2028, 2).to).toBe("2028-02-29");
    expect(openPeriod(2026, 0)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(openPeriodLabel({ year: 2026, month: 10 })).toBe("octobre 2026");
    expect(openPeriodLabel({ year: 2026, month: 0 })).toBe("année 2026");
  });

  it("nuit en PACO seulement : RCCA seul ne propose que AM et PM", () => {
    expect(openKindsFor([])).toEqual(["am", "pm", "nuit"]);
    expect(openKindsFor(["paco"])).toEqual(["am", "pm", "nuit"]);
    expect(openKindsFor(["rcca"])).toEqual(["am", "pm"]);
  });

  it("filtres en clair", () => {
    expect(
      openFilterText(
        {
          year: 2026,
          month: 10,
          groups: ["111"],
          functions: ["paco"],
          kinds: ["am", "nuit"],
          statuses: [],
        },
        [{ groupId: "111", label: "OCC Mons" }],
      ),
    ).toBe("Zone : OCC Mons · Fonction : PACO · Service : AM, Nuit");
  });
});

describe("services non alignés : exports", () => {
  const rows: OpenRow[] = [
    {
      zone: "OCC Mons",
      day: "2026-10-05",
      from: "06:00",
      to: "14:00",
      code: "PACO_AM",
      section: "PACO Mons",
      kind: "am",
      function: "paco",
      district: "DSO",
      status: "vide",
      coveredBy: "",
      marker: "",
    },
    {
      zone: "OCC Namur",
      day: "2026-10-06",
      from: "14:00",
      to: "22:00",
      code: "=RCCA_PM",
      section: "",
      kind: "pm",
      function: "rcca",
      district: "DSE",
      status: "fusion",
      coveredBy: "OCC Mons",
      marker: "+SE",
    },
  ];

  it("cellules, jour de la semaine, totaux", () => {
    expect(weekday("2026-10-05")).toBe("lundi");
    expect(openCells(rows[0]!)).toEqual([
      "2026-10-05",
      "lundi",
      "OCC Mons",
      "DSO",
      "PACO",
      "AM",
      "06:00",
      "14:00",
      "Sans agent",
      "PACO_AM",
      "PACO Mons",
    ]);
    expect(openTotals(rows)).toMatchObject({
      total: 2,
      functions: [
        ["PACO", 1],
        ["RCCA", 1],
      ],
    });
  });

  it("CSV : BOM, « ; », formule neutralisée", () => {
    const csv = openCsv(rows);
    expect(csv.startsWith("﻿Date;Jour;Zone")).toBe(true);
    expect(csv).toContain(";'=RCCA_PM;");
  });

  it("nom de fichier", () => {
    expect(openFileName(2026, 3)).toBe("services-non-alignes-2026-03");
    expect(openFileName(2026, 0)).toBe("services-non-alignes-2026");
  });
});

describe("postes non alignés : fusions « +SE / +SO »", () => {
  const ZONES = [
    { groupId: "111", label: "OCC Mons", district: "DSO" },
    { groupId: "222", label: "OCC Namur", district: "DSE" },
  ];
  const slot = (o: Partial<Parameters<typeof alignRows>[0][number]> = {}) => ({
    groupId: "222",
    zone: "OCC Namur",
    district: "DSE",
    day: "2026-10-05",
    start: "2026-10-05T04:00:00.000Z",
    end: "2026-10-05T12:00:00.000Z",
    code: "PACO_AM",
    section: "PACO Namur",
    kind: "am" as const,
    function: "paco" as const,
    ...o,
  });

  it("marqueur → district couvert", () => {
    expect(["SE", "dse", "SO", "CE", "X", ""].map(coverDistrict)).toEqual([
      "DSE",
      "DSE",
      "DSO",
      "DCE",
      "",
      "",
    ]);
  });

  it("conversion : PACO / RCCA marqués, marqueur vers soi-même ou inconnu écarté", () => {
    const b = batch({
      open: undefined,
      covers: [
        {
          id: "31",
          groupId: "211",
          begin: "2026-10-05T06:00:00",
          end: "2026-10-05T14:00:00",
          shiftTypeId: "1",
          cover: "SE",
        },
        {
          id: "32",
          groupId: "211",
          begin: "2026-10-05T14:00:00",
          end: "2026-10-05T22:00:00",
          shiftTypeId: "1",
          cover: "SO",
        },
        {
          id: "33",
          groupId: "211",
          begin: "2026-10-06T06:00:00",
          end: "2026-10-06T14:00:00",
          shiftTypeId: "3",
          cover: "SE",
        },
        {
          id: "34",
          groupId: "211",
          begin: "2026-10-06T06:00:00",
          end: "2026-10-06T14:00:00",
          shiftTypeId: "1",
          cover: "ZZ",
        },
      ],
    });
    const { covers, ignored } = mapCovers(b, PLACES, "DSO");
    expect(covers).toHaveLength(1);
    expect(covers[0]).toMatchObject({
      quinyx_id: "31",
      district: "DSO",
      cover: "DSE",
      function: "paco",
      kind: "am",
    });
    expect(ignored).toBe(3);
  });

  it("service sans agent à Namur + agent de Mons « +SE » = couvert par fusion (une seule ligne)", () => {
    const rows = alignRows(
      [slot()],
      [
        {
          ...slot({ groupId: "111", zone: "OCC Mons", district: "DSO", section: "PACO Mons" }),
          cover: "DSE",
        },
      ],
      ZONES,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      zone: "OCC Namur",
      status: "fusion",
      coveredBy: "OCC Mons",
      marker: "+SE",
      inferred: false,
    });
  });

  it("fusion sans service publié de l'autre côté : ligne déduite dans la zone couverte", () => {
    const rows = alignRows(
      [],
      [
        {
          ...slot({
            groupId: "222",
            zone: "OCC Namur",
            district: "DSE",
            kind: "pm",
            function: "rcca",
          }),
          cover: "DSO",
        },
      ],
      ZONES,
    );
    expect(rows[0]).toMatchObject({
      groupId: "111",
      zone: "OCC Mons",
      district: "DSO",
      status: "fusion",
      marker: "+SO",
      inferred: true,
    });
  });

  it("autre service ou autre jour : pas de rapprochement", () => {
    const rows = alignRows(
      [slot()],
      [
        {
          ...slot({ groupId: "111", zone: "OCC Mons", district: "DSO", kind: "pm" }),
          cover: "DSE",
        },
      ],
      ZONES,
    );
    expect(rows.map((r) => [r.status, r.kind, r.inferred])).toEqual([
      ["vide", "am", false],
      ["fusion", "pm", true],
    ]);
  });

  it("texte de couverture", () => {
    expect(coverText({ status: "fusion", coveredBy: "OCC Mons", marker: "+SE" })).toBe(
      "Couvert par fusion (+SE, agent OCC Mons)",
    );
    expect(coverText({ status: "vide", coveredBy: "", marker: "" })).toBe("Sans agent");
  });
});
