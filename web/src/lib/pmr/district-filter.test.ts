import { describe, expect, it } from "vitest";

import { defaultBusPeriod, resolveBusPeriod } from "../orders/period";
import {
  districtCodes,
  districtsLabel,
  effectiveDistricts,
  inDistricts,
  normalizeDistricts,
} from "./district-filter";

describe("filtre district par défaut (Missions PMR, Groupes)", () => {
  it("normalise : codes valides, sans doublon, ordre stable", () => {
    expect(normalizeDistricts("dso,DSE,DSO,XXX")).toBe("DSE,DSO");
    expect(normalizeDistricts("tous")).toBe("");
    expect(normalizeDistricts(undefined)).toBe("");
    expect(districtCodes("DSO,DCE")).toEqual(["DCE", "DSO"]);
    expect(districtsLabel("DSO,DSE")).toBe("DSE + DSO");
  });

  it("sans paramètre : districts du jour de l'agent", () => {
    expect(effectiveDistricts(undefined, ["Sud-Ouest"])).toBe("DSO");
    expect(effectiveDistricts(undefined, ["Sud-Est", "Centre"])).toBe("DCE,DSE");
    expect(effectiveDistricts(undefined, [])).toBe("");
  });

  it("l'URL explicite l'emporte (« tous » ou vide = tous les districts)", () => {
    expect(effectiveDistricts("tous", ["Sud-Ouest"])).toBe("");
    expect(effectiveDistricts("", ["Sud-Ouest"])).toBe("");
    expect(effectiveDistricts("DCE", ["Sud-Ouest"])).toBe("DCE");
  });

  it("appartenance d'une gare au filtre", () => {
    expect(inDistricts("DSO", "")).toBe(true);
    expect(inDistricts("DSO", "DSE,DSO")).toBe(true);
    expect(inDistricts("DCE", "DSE,DSO")).toBe(false);
    expect(inDistricts("", "DSO")).toBe(false);
  });
});

describe("période par défaut des bons bus", () => {
  it("d'hier à aujourd'hui + 6 jours", () => {
    expect(defaultBusPeriod("2026-10-11")).toEqual({ du: "2026-10-10", au: "2026-10-17" });
    expect(defaultBusPeriod("2026-12-31")).toEqual({ du: "2026-12-30", au: "2027-01-06" });
  });

  it("seulement sans borne dans l'URL", () => {
    expect(resolveBusPeriod({}, "2026-10-11")).toEqual({
      du: "2026-10-10",
      au: "2026-10-17",
      isDefault: true,
    });
    expect(resolveBusPeriod({ du: "", au: "" }, "2026-10-11")).toEqual({
      du: "",
      au: "",
      isDefault: false,
    });
    expect(resolveBusPeriod({ du: "2026-09-01" }, "2026-10-11")).toEqual({
      du: "2026-09-01",
      au: "",
      isDefault: false,
    });
    expect(resolveBusPeriod({ du: "n'importe", au: "2026-10-12" }, "2026-10-11").du).toBe("");
  });
});
