import { describe, expect, it } from "vitest";

import {
  delayLabel,
  delayTone,
  looksLikeTrain,
  normalizeTrain,
  parseFavorites,
  trainLabel,
} from "./irail";
import { entrySchema, safeUrl, segments } from "./log";
import {
  aggregate,
  buckets,
  granularityFor,
  median,
  mondayOf,
  normalizeReason,
  type StatOrder,
} from "./stats";
import { inBelgium } from "./tiles";

describe("iRail", () => {
  it("normalise les numéros de train", () => {
    expect(normalizeTrain("IC 2134")).toBe("IC2134");
    expect(normalizeTrain("be.nmbs.ic2134")).toBe("IC2134");
    expect(normalizeTrain("2134")).toBe("2134");
    expect(normalizeTrain("Mons")).toBe("");
    expect(normalizeTrain("IC2134; DROP")).toBe("");
    expect(trainLabel("IC2134")).toBe("IC 2134");
    expect(looksLikeTrain("ic 2134")).toBe(true);
    expect(looksLikeTrain("Mons")).toBe(false);
  });
  it("seuils de retard", () => {
    expect(delayTone(0, false)).toBe("ok");
    expect(delayTone(5, false)).toBe("warn");
    expect(delayTone(15, false)).toBe("danger");
    expect(delayTone(0, true)).toBe("danger");
    expect(delayLabel(0, false)).toBe("À l'heure");
    expect(delayLabel(7, false)).toBe("+7 min");
    expect(delayLabel(7, true)).toBe("Supprimé");
  });
  it("gares favorites : identifiants iRail seulement, 8 au plus", () => {
    const prefs = {
      operations: {
        favoriteStations: [
          { id: "BE.NMBS.008881000", name: "Mons" },
          { id: "javascript:x", name: "X" },
          "x",
        ],
      },
    };
    expect(parseFavorites(prefs)).toEqual([{ id: "BE.NMBS.008881000", name: "Mons" }]);
    expect(parseFavorites(null)).toEqual([]);
  });
});

describe("main courante", () => {
  it("découpe mentions et liens sans HTML", () => {
    const s = segments("Voir @jdupont. et https://exemple.invalid/a, <b>ok</b>");
    expect(s.map((x) => x.kind)).toEqual(["text", "mention", "text", "url", "text"]);
    expect(s[1]?.value).toBe("@jdupont");
    expect(s[3]?.value).toBe("https://exemple.invalid/a");
    expect(s[4]?.value).toContain("<b>ok</b>");
  });
  it("liens http(s) seulement", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("https://exemple.invalid")).toBe("https://exemple.invalid/");
  });
  it("valide une entrée (train normalisé, caractères de contrôle retirés)", () => {
    const e = entrySchema.parse({
      body: " Texte\u0007 ",
      category: "incident",
      day: "2026-10-08",
      time: "14:05",
      train: "ic 2134",
    });
    expect(e.body).toBe("Texte");
    expect(e.train).toBe("IC2134");
    expect(() =>
      entrySchema.parse({ body: " ", category: "info", day: "2026-10-08", time: "14:05" }),
    ).toThrow();
    expect(() =>
      entrySchema.parse({ body: "x", category: "info", day: "2026-10-08", time: "25:00" }),
    ).toThrow();
    expect(() =>
      entrySchema.parse({
        body: "x",
        category: "info",
        day: "2026-10-08",
        time: "10:00",
        train: "Mons",
      }),
    ).toThrow();
  });
});

describe("statistiques", () => {
  it("granularité et seaux", () => {
    expect(granularityFor("2026-10-01", "2026-10-31")).toBe("jour");
    expect(granularityFor("2026-01-01", "2026-05-31")).toBe("semaine");
    expect(granularityFor("2026-01-01", "2026-12-31")).toBe("mois");
    expect(mondayOf("2026-10-11")).toBe("2026-10-05");
    expect(buckets("2026-01-30", "2026-03-02", "mois")).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([])).toBeNull();
    expect(normalizeReason("  avarie MATÉRIEL. ")).toBe("Avarie matériel");
  });
  it("agrège sans brouillons, délai de confirmation borné", () => {
    const o = (p: Partial<StatOrder>): StatOrder => ({
      kind: "bus",
      day: "2026-10-05",
      status: "confirme",
      district: "Sud-Ouest",
      company: "A",
      c3Type: 2,
      buses: 2,
      route: "Mons → Tournai",
      lines: ["L.96"],
      reason: "Avarie",
      sentAt: 0,
      confirmedAt: 0,
      ...p,
    });
    const t0 = Date.parse("2026-10-05T08:00:00Z");
    const s = aggregate(
      [
        o({ sentAt: t0, confirmedAt: t0 + 20 * 60000 }),
        o({ status: "annule", company: "B" }),
        o({ status: "brouillon" }),
        o({ kind: "taxi", buses: 0, sentAt: t0, confirmedAt: t0 + 3 * 86400000 }),
      ],
      null,
      "2026-10-01",
      "2026-10-07",
    );
    expect(s.totals.bus).toBe(2);
    expect(s.totals.taxi).toBe(1);
    expect(s.totals.buses).toBe(4);
    expect(s.totals.medianConfirm).toBe(20);
    expect(s.totals.cancelled).toBe(1);
    expect(s.series).toHaveLength(7);
    expect(s.totals.assists).toBeNull();
  });
});

describe("tuiles", () => {
  it("relaie la Belgique seulement, zooms 7 à 18", () => {
    expect(inBelgium(10, 523, 343)).toBe(true);
    expect(inBelgium(10, 0, 0)).toBe(false);
    expect(inBelgium(5, 16, 10)).toBe(false);
    expect(inBelgium(19, 1, 1)).toBe(false);
    expect(inBelgium(10.5, 523, 343)).toBe(false);
  });
});
