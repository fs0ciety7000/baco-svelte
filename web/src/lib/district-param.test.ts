import { describe, expect, it } from "vitest";

import {
  anyDistrictFilter,
  appendDistricts,
  districtTokens,
  isAllDistricts,
  parseDistricts,
} from "./district-param";
import { effectiveDistricts, normalizeDistricts } from "./pmr/district-filter";

const NAMES = ["Sud-Ouest", "Sud-Est", "Centre"];
const CODES = ["DSO", "DSE", "DCE", "DNO", "DNE", "aucun"];

describe("paramètre district à plusieurs valeurs", () => {
  it("répété, liste « a,b » ou unique", () => {
    expect(districtTokens(["DSO", "DSE,DCE"])).toEqual(["DSO", "DSE", "DCE"]);
    expect(districtTokens("DSO, DSE")).toEqual(["DSO", "DSE"]);
    expect(districtTokens(undefined)).toEqual([]);
  });

  it("« tous » ou vide lève le filtre ; absent ≠ tous", () => {
    expect(isAllDistricts("tous")).toBe(true);
    expect(isAllDistricts("")).toBe(true);
    expect(isAllDistricts(["tous"])).toBe(true);
    expect(isAllDistricts(undefined)).toBe(false);
    expect(isAllDistricts(["DSO"])).toBe(false);
  });

  it("codes ↔ noms, casse ignorée, ordre de la liste permise, inconnus écartés", () => {
    expect(parseDistricts(["DSO", "centre"], NAMES)).toEqual(["Sud-Ouest", "Centre"]);
    expect(parseDistricts("Sud-Est,XXX", ["DSO", "DSE", "DCE"])).toEqual(["DSE"]);
    expect(parseDistricts(["aucun", "dne"], CODES)).toEqual(["DNE", "aucun"]);
    expect(parseDistricts("tous", NAMES)).toEqual([]);
  });

  it("filtre PocketBase lié (OU) et liens répétés", () => {
    const pb = {
      filter: (e: string, p?: Record<string, unknown>) =>
        e.replace(/\{:(\w+)\}/g, (_, k: string) => JSON.stringify(p?.[k])),
    };
    expect(anyDistrictFilter(pb, "district", ["DSO", "DSE"])).toBe(
      '(district = "DSO" || district = "DSE")',
    );
    expect(anyDistrictFilter(pb, ["district", "arr_district"], ["DSO"])).toBe(
      '(district = "DSO" || arr_district = "DSO")',
    );
    expect(anyDistrictFilter(pb, "districts", ["Centre"], "~")).toBe('(districts ~ "Centre")');
    expect(anyDistrictFilter(pb, "district", [])).toBe("");
    expect(appendDistricts(new URLSearchParams({ q: "x" }), ["DSO", "DSE"]).toString()).toBe(
      "q=x&district=DSO&district=DSE",
    );
  });

  it("Missions PMR : paramètre répété et noms acceptés, défaut = districts du jour", () => {
    expect(normalizeDistricts(["DSO", "DSE"])).toBe("DSE,DSO");
    expect(normalizeDistricts(["Sud-Ouest"])).toBe("DSO");
    expect(effectiveDistricts(["DSO", "DCE"], ["Sud-Est"])).toBe("DCE,DSO");
    expect(effectiveDistricts(["tous"], ["Sud-Est"])).toBe("");
    expect(effectiveDistricts(undefined, ["Sud-Est"])).toBe("DSE");
  });
});
