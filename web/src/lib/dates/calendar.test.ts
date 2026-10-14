import { describe, expect, it } from "vitest";

import {
  addMonths,
  belgianHolidays,
  easterSunday,
  formatDateFr,
  holidayName,
  maskDateDigits,
  monthGrid,
  parseDateText,
  parseMonthText,
  parseTimeText,
  stepDate,
  stepTime,
  todayIso,
  weekday,
  WEEKDAYS,
} from "./calendar";

const REF = "2026-10-14";

describe("parseDateText", () => {
  it.each([
    ["14/10/2026", "2026-10-14"],
    ["14102026", "2026-10-14"],
    ["141026", "2026-10-14"],
    ["14/10", "2026-10-14"],
    ["1410", "2026-10-14"],
    ["3", "2026-10-03"],
    ["1-2-27", "2027-02-01"],
    ["14.10.2026", "2026-10-14"],
    ["2026-10-14", "2026-10-14"],
    [" 29/02/2028 ", "2028-02-29"],
  ])("%s → %s", (text, iso) => {
    expect(parseDateText(text, REF)).toBe(iso);
  });

  it.each(["", "31/02/2026", "29/02/2027", "32/01", "14/13", "abc", "14/10/202", "1234567"])(
    "refuse %s",
    (text) => {
      expect(parseDateText(text, REF)).toBeNull();
    },
  );
});

describe("format et saisie", () => {
  it("affiche jj/mm/aaaa", () => {
    expect(formatDateFr("2026-01-05")).toBe("05/01/2026");
    expect(formatDateFr("")).toBe("");
    expect(formatDateFr("2026-02-30")).toBe("");
  });
  it("insère les barres dans une suite de chiffres", () => {
    expect(maskDateDigits("14")).toBe("14");
    expect(maskDateDigits("1410")).toBe("14/10");
    expect(maskDateDigits("14102026")).toBe("14/10/2026");
    expect(maskDateDigits("14/1")).toBe("14/1");
  });
  it("↑ ↓ par segment", () => {
    expect(stepDate("2026-10-31", "d", 1)).toBe("2026-11-01");
    expect(stepDate("2026-01-31", "m", 1)).toBe("2026-02-28");
    expect(stepDate("2028-02-29", "y", -1)).toBe("2027-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });
  it("jour courant à Bruxelles", () => {
    // 22:30 UTC le 14 = 00:30 le 15 à Bruxelles (heure d'été).
    expect(todayIso(new Date("2026-10-14T22:30:00Z"))).toBe("2026-10-15");
  });
});

describe("calendrier", () => {
  it("semaine du lundi, libellés français", () => {
    expect(weekday("2026-10-12")).toBe(0);
    expect(weekday("2026-10-18")).toBe(6);
    expect(WEEKDAYS[0]).toEqual({ short: "lu", long: "lundi" });
    expect(WEEKDAYS[6]?.long).toBe("dimanche");
  });
  it("grille de 6 semaines commençant un lundi", () => {
    const g = monthGrid(2026, 10);
    expect(g).toHaveLength(6);
    expect(g[0]?.[0]).toBe("2026-09-28");
    expect(g.flat()).toContain("2026-10-31");
    expect(g.flat().every((d, i, a) => i === 0 || d > a[i - 1]!)).toBe(true);
  });
});

describe("jours fériés belges", () => {
  it.each([
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
    [2038, "2038-04-25"],
  ])("Pâques %i = %s", (y, iso) => {
    expect(easterSunday(y)).toBe(iso);
  });

  it("2026 : 10 jours fériés légaux + Pâques et Pentecôte", () => {
    const h = belgianHolidays(2026);
    expect(h.size).toBe(12);
    expect(h.get("2026-04-06")).toBe("Lundi de Pâques");
    expect(h.get("2026-05-14")).toBe("Ascension");
    expect(h.get("2026-05-25")).toBe("Lundi de Pentecôte");
    expect(h.get("2026-07-21")).toBe("Fête nationale");
    expect(h.get("2026-11-11")).toBe("Armistice");
    expect(holidayName("2026-12-25")).toBe("Noël");
    expect(holidayName("2026-10-14")).toBeUndefined();
  });
});

describe("heures", () => {
  it.each([
    ["1450", "14:50"],
    ["945", "09:45"],
    ["9", "09:00"],
    ["14", "14:00"],
    ["14h50", "14:50"],
    ["14h", "14:00"],
    ["14:5", "14:05"],
    ["7.30", "07:30"],
    ["0000", "00:00"],
  ])("%s → %s", (t, v) => {
    expect(parseTimeText(t)).toBe(v);
  });
  it.each(["", "2400", "1460", "25", "abc", "12345"])("refuse %s", (t) => {
    expect(parseTimeText(t)).toBeNull();
  });
  it("pas de 5 minutes, aligné, tour d'horloge", () => {
    expect(stepTime("14:50", 5, 5)).toBe("14:55");
    expect(stepTime("14:52", 5, 5)).toBe("14:55");
    expect(stepTime("14:52", -5, 5)).toBe("14:50");
    expect(stepTime("23:55", 5, 5)).toBe("00:00");
    expect(stepTime("00:10", -60)).toBe("23:10");
  });
});

describe("mois", () => {
  it.each([
    ["10/2026", "2026-10"],
    ["102026", "2026-10"],
    ["1026", "2026-10"],
    ["3/27", "2027-03"],
    ["2026-10", "2026-10"],
  ])("%s → %s", (t, v) => {
    expect(parseMonthText(t)).toBe(v);
  });
  it("refuse un mois impossible", () => {
    expect(parseMonthText("13/2026")).toBeNull();
  });
});
