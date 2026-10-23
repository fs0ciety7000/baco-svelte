import { describe, expect, it } from "vitest";

import {
  mapOpenShifts,
  openFilterQuery,
  openFunction,
  openPeriod,
  openPeriodLabel,
  parseOpenFilter,
  quinyxBatchSchema,
  type QuinyxBatch,
} from "./model";
import { openCells, openCsv, openFileName, openTotals, weekday, type OpenRow } from "./open-export";
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
      { id: 2, name: "RCCA_N" },
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

describe("services non pourvus : conversion", () => {
  it("fonction PACO / RCCA d'après le type, rien pour EXTRA", () => {
    expect(openFunction("PACO_AM")).toBe("paco");
    expect(openFunction("RCCA_N")).toBe("rcca");
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
    expect(nuit).toMatchObject({ function: "rcca", kind: "nuit", day: "2026-10-05" });
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

describe("services non pourvus : filtres", () => {
  const params = (q: string) => new URLSearchParams(q);

  it("par défaut : mois en cours", () => {
    expect(parseOpenFilter(params(""), "2026-10-23")).toEqual({
      year: 2026,
      month: 10,
      groups: [],
      functions: [],
      kinds: [],
    });
  });

  it("année entière, zones, fonctions, types ; valeurs inconnues écartées", () => {
    const f = parseOpenFilter(
      params("annee=2025&mois=0&zone=111&zone=abc&fonction=RCCA,x&type=nuit&type=extra"),
      "2026-10-23",
    );
    expect(f).toEqual({
      year: 2025,
      month: 0,
      groups: ["111"],
      functions: ["rcca"],
      kinds: ["nuit"],
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

  it("filtres en clair", () => {
    expect(
      openFilterText(
        { year: 2026, month: 10, groups: ["111"], functions: ["paco"], kinds: ["am", "nuit"] },
        [{ groupId: "111", label: "OCC Mons" }],
      ),
    ).toBe("Zone : OCC Mons · Fonction : PACO · Service : AM, Nuit");
  });
});

describe("services non pourvus : exports", () => {
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
    },
    {
      zone: "OCC Namur",
      day: "2026-10-06",
      from: "22:00",
      to: "06:00",
      code: "=RCCA_N",
      section: "",
      kind: "nuit",
      function: "rcca",
      district: "DSE",
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
    expect(csv).toContain(";'=RCCA_N;");
  });

  it("nom de fichier", () => {
    expect(openFileName(2026, 3)).toBe("services-non-pourvus-2026-03");
    expect(openFileName(2026, 0)).toBe("services-non-pourvus-2026");
  });
});
