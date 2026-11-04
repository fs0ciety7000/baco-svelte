import { describe, expect, it } from "vitest";

import {
  groupByWeek,
  isoWeekOf,
  monthBounds,
  monthLabelFr,
  parseWeekKey,
  weekBounds,
  weekKeyOf,
  weekLabel,
} from "./week";

describe("semaines ISO", () => {
  it("lundi → dimanche", () => {
    expect(isoWeekOf("2026-11-02")).toEqual({ year: 2026, week: 45 });
    expect(isoWeekOf("2026-11-08")).toEqual({ year: 2026, week: 45 });
    expect(isoWeekOf("2026-11-09")).toEqual({ year: 2026, week: 46 });
    expect(weekBounds({ year: 2026, week: 45 })).toEqual({ from: "2026-11-02", to: "2026-11-08" });
  });
  it("passage d'année : semaine 53 et semaine 1", () => {
    // 2020 a 53 semaines : le 1er janvier 2021 (vendredi) est en 2020-W53.
    expect(weekKeyOf("2021-01-01")).toBe("2020-W53");
    expect(weekKeyOf("2021-01-04")).toBe("2021-W01");
    // Le 29 décembre 2025 (lundi) est en 2026-W01.
    expect(weekKeyOf("2025-12-29")).toBe("2026-W01");
    expect(weekBounds({ year: 2026, week: 1 })).toEqual({ from: "2025-12-29", to: "2026-01-04" });
    expect(weekKeyOf("2026-12-31")).toBe("2026-W53");
  });
  it("clé lue et contrôlée", () => {
    expect(parseWeekKey("2026-W45")).toEqual({ year: 2026, week: 45 });
    expect(parseWeekKey("2026-W53")).toEqual({ year: 2026, week: 53 });
    expect(parseWeekKey("2025-W53")).toBeNull(); // 2025 n'a que 52 semaines
    expect(parseWeekKey("2026-45")).toBeNull();
    expect(parseWeekKey("2026-W00")).toBeNull();
  });
  it("libellés", () => {
    expect(weekLabel({ year: 2026, week: 45 })).toBe("Semaine 45 · du 2 au 8 novembre 2026");
    expect(weekLabel({ year: 2026, week: 40 })).toBe(
      "Semaine 40 · du 28 septembre au 4 octobre 2026",
    );
    expect(weekLabel({ year: 2026, week: 1 })).toBe(
      "Semaine 1 · du 29 décembre 2025 au 4 janvier 2026",
    );
    expect(monthLabelFr("2026-02")).toBe("février 2026");
    expect(monthBounds("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
  it("regroupement, semaine la plus récente d'abord", () => {
    const g = groupByWeek(
      [{ d: "2026-11-03" }, { d: "2026-10-30" }, { d: "2026-11-08" }, { d: "" }],
      (r) => r.d,
    );
    expect(g.map((w) => [w.key, w.rows.length])).toEqual([
      ["2026-W45", 2],
      ["2026-W44", 1],
    ]);
  });
});
