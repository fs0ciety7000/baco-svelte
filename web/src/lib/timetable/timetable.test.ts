import { describe, expect, it } from "vitest";

import { csvReader, parseCsvLine } from "./csv";
import { timetableBuilder } from "./gtfs";
import { infrabelDay, opPointsFrom, pathCollector } from "./infrabel";
import {
  belgianHolidays,
  dayFilterOf,
  referenceWeek,
  daysLabel,
  keyOf,
  lineNorm,
  relationKey,
  relationName,
  relationOrder,
  seriesLabel,
  seriesOf,
  trainType,
} from "./model";

describe("modèle", () => {
  it("normalise relations, types, lignes et séries", () => {
    expect(relationName("IC 14")).toBe("IC14");
    expect(relationName("IC 06-2")).toBe("IC06-2");
    expect(relationName("L 31")).toBe("L31");
    expect(relationName("S1-1")).toBe("S1-1");
    expect(relationName("P")).toBe("P");
    expect(trainType("IC14")).toBe("IC");
    expect(trainType("S1-1")).toBe("S");
    expect(trainType("EXTRA", "IC")).toBe("IC");
    expect(trainType("", "S32")).toBe("S");
    expect(trainType("INT", "EC")).toBe("EC");
    expect(lineNorm("0/3")).toBe("0");
    expect(lineNorm("161/2")).toBe("161");
    expect(lineNorm("50D(1)")).toBe("50D");
    expect(lineNorm("36N")).toBe("36N");
    expect(seriesOf(1706)).toBe("1700-1749");
    expect(seriesOf(1757)).toBe("1750-1799");
    expect(seriesOf(912)).toBe("900-949");
    expect(seriesLabel("1700-1749")).toBe("17xx (00-49)");
    expect(seriesLabel("3800-3849")).toBe("38xx (00-49)");
    expect(seriesLabel("950-999")).toBe("9xx (50-99)");
  });

  it("jours, clés et regroupement", () => {
    expect(daysLabel(31)).toBe("Lun-ven");
    expect(daysLabel(96)).toBe("Week-end");
    expect(daysLabel(127)).toBe("Tous les jours");
    expect(daysLabel(1 | 4)).toBe("Lun, Mer");
    expect(keyOf(["Mons", "Bergen", "Saint-Ghislain", "mons"])).toBe(
      "|mons|bergen|saint ghislain|",
    );
    expect(relationKey({ relation: "IC14", origin: "Tongres", terminus: "Quiévrain" })).toBe(
      "IC14",
    );
    expect(relationKey({ relation: "P", origin: "Schaerbeek", terminus: "Quévy" })).toBe(
      relationKey({ relation: "P", origin: "Quévy", terminus: "Schaerbeek" }),
    );
    expect(dayFilterOf(undefined, 2)).toBe("semaine");
    expect(dayFilterOf(undefined, 5)).toBe("samedi");
    expect(dayFilterOf("tous", 6)).toBe("tous");
    const sorted = [
      { type: "L", relation: "L31" },
      { type: "IC", relation: "EXTRA" },
      { type: "IC", relation: "IC14" },
      { type: "IC", relation: "IC02" },
    ].sort(relationOrder);
    expect(sorted.map((r) => r.relation)).toEqual(["IC02", "IC14", "EXTRA", "L31"]);
  });
});

describe("semaine de référence", () => {
  it("fériés belges et remplacement par la semaine suivante", () => {
    const h = belgianHolidays(2027);
    expect(h.has("2027-03-29")).toBe(true); // lundi de Pâques 2027
    expect(h.has("2027-05-06")).toBe(true); // Ascension
    expect(h.has("2027-05-17")).toBe(true); // lundi de Pentecôte
    expect(h.has("2027-11-11")).toBe(true);
    // Semaine du lundi 9 novembre 2026 : le mercredi 11 (férié) est remplacé par le mercredi 18.
    expect(referenceWeek("2026-11-09")).toEqual([
      "20261109",
      "20261110",
      "20261118",
      "20261112",
      "20261113",
      "20261114",
      "20261115",
    ]);
  });
});

describe("CSV", () => {
  it("lit les guillemets et l'en-tête", () => {
    expect(parseCsvLine('a,"b,c","d""e",')).toEqual(["a", "b,c", 'd"e', ""]);
    const read = csvReader(";");
    expect(read("﻿Train_No;Relation")).toBeNull();
    expect(read("1706;IC 14")).toEqual({ train_no: "1706", relation: "IC 14" });
  });
});

const OPS = opPointsFrom([
  { longnamedutch: "QUIEVRAIN", commerciallongnamefrench: "Quiévrain", classification: "Station" },
  {
    longnamedutch: "SAINT-GHISLAIN",
    commerciallongnamefrench: "Saint-Ghislain",
    classification: "Station",
  },
  {
    longnamedutch: "Y.SAINT-GHISLAIN",
    commerciallongnamefrench: "Y.Saint-Ghislain",
    classification: "Vertakking",
  },
  {
    longnamedutch: "BERGEN",
    commerciallongnamefrench: "Mons",
    commerciallongnamedutch: "Bergen",
    classification: "Station",
  },
  { longnamedutch: "JEMAPPES", commerciallongnamefrench: "Jemappes", classification: "Stopplaats" },
  { longnamedutch: "ZINNIK", commerciallongnamefrench: "Soignies", classification: "Station" },
]);

function d1(rows: string[][]) {
  const c = pathCollector();
  for (const [datdep, train_no, relation, nl, la, ld, ta, td] of rows)
    c.add({
      datdep: datdep!,
      train_no: train_no!,
      relation: relation!,
      relation_direction: `${relation}: QUIEVRAIN -> TONGEREN`,
      ptcar_lg_nm_nl: nl!,
      line_no_arr: la!,
      line_no_dep: ld!,
      planned_time_arr: ta!,
      planned_time_dep: td!,
      planned_date_arr: datdep!,
      planned_date_dep: datdep!,
    });
  return c;
}

describe("Infrabel", () => {
  it("dates des deux formats", () => {
    expect(infrabelDay("2026-10-13")).toBe("2026-10-13");
    expect(infrabelDay("01SEP2026")).toBe("2026-09-01");
    expect(infrabelDay("x")).toBe("");
  });

  it("chemin : relation, lignes dans l'ordre, gares seulement, jour le plus récent", () => {
    const c = d1([
      ["2026-10-13", "1706", "IC 14", "SAINT-GHISLAIN", "97", "97", "06:27:00", "06:31:00"],
      ["2026-10-13", "1706", "IC 14", "QUIEVRAIN", "", "97", "", "06:11:00"],
      ["2026-10-13", "1706", "IC 14", "Y.SAINT-GHISLAIN", "97", "96", "06:33:00", "06:33:00"],
      ["2026-10-13", "1706", "IC 14", "BERGEN", "96", "96", "06:45:00", "06:50:00"],
      ["2026-10-13", "1706", "IC 14", "ZINNIK", "96", "", "07:08:00", ""],
      ["2026-10-12", "1706", "IC 99", "BERGEN", "1", "1", "06:45:00", "06:50:00"],
    ]);
    const [p] = c.paths(OPS);
    expect(p).toMatchObject({
      number: 1706,
      day: "2026-10-13",
      relation: "IC14",
      direction: "QUIEVRAIN -> TONGEREN",
    });
    expect(p!.lines).toEqual(["97", "96"]);
    expect(p!.points.map((x) => x.n)).toEqual(["Quiévrain", "Saint-Ghislain", "Mons", "Soignies"]);
    expect(p!.points.at(-1)!.l).toBe("96");
  });
});

describe("GTFS", () => {
  // Semaine du lundi 19 au dimanche 25 octobre 2026.
  const dates = [
    "20261019",
    "20261020",
    "20261021",
    "20261022",
    "20261023",
    "20261024",
    "20261025",
  ];

  function build(paths = d1([]).paths(OPS)) {
    const b = timetableBuilder(dates);
    b.addRoute({ route_id: "r1", route_short_name: "IC" });
    b.addRoute({ route_id: "r2", route_short_name: "BUS" });
    b.addCalendar({
      service_id: "s1",
      monday: "1",
      tuesday: "1",
      wednesday: "1",
      thursday: "1",
      friday: "1",
      saturday: "0",
      sunday: "0",
      start_date: "20260101",
      end_date: "20261212",
    });
    b.addCalendar({
      service_id: "s2",
      monday: "0",
      tuesday: "0",
      wednesday: "0",
      thursday: "0",
      friday: "0",
      saturday: "0",
      sunday: "0",
      start_date: "20260101",
      end_date: "20261212",
    });
    b.addCalendarDate({ service_id: "s2", date: "20261024", exception_type: "1" });
    b.addCalendarDate({ service_id: "s1", date: "20261023", exception_type: "2" });
    b.addTrip({ route_id: "r1", service_id: "s1", trip_id: "t1", trip_short_name: "1706" });
    b.addTrip({ route_id: "r1", service_id: "s2", trip_id: "t2", trip_short_name: "1706" });
    b.addTrip({ route_id: "r2", service_id: "s1", trip_id: "t3", trip_short_name: "9999" });
    for (const [id, n] of [
      ["1", "Quiévrain"],
      ["2", "Saint-Ghislain"],
      ["3", "Ghlin"],
      ["4", "Mons"],
      ["5", "Soignies"],
    ])
      b.addStop({ stop_id: id!, stop_name: n! });
    b.addTranslation({
      table_name: "stops",
      field_name: "stop_name",
      language: "nl",
      translation: "Bergen",
      field_value: "Mons",
    });
    const st = (trip: string, seq: number, stop: string, a: string, d: string, pass = false) =>
      b.addStopTime({
        trip_id: trip,
        stop_sequence: String(seq),
        stop_id: stop,
        arrival_time: a,
        departure_time: d,
        pickup_type: pass ? "1" : "0",
        drop_off_type: pass ? "1" : "0",
      });
    st("t1", 1, "1", "06:11:00", "06:11:00");
    st("t1", 2, "2", "06:27:00", "06:31:00");
    st("t1", 3, "3", "06:40:00", "06:40:00", true);
    st("t1", 4, "4", "06:45:00", "06:50:00");
    st("t1", 5, "5", "07:08:00", "07:08:00");
    // Samedi : autre horaire, même n° → autre variante.
    st("t2", 1, "1", "08:11:00", "08:11:00");
    st("t2", 2, "4", "08:45:00", "08:50:00");
    st("t3", 1, "1", "06:00:00", "06:00:00");
    st("t3", 2, "4", "06:30:00", "06:30:00");
    return b.build(paths);
  }

  it("services : jours (exceptions comprises), passages, bus écartés, NL dans la clé", () => {
    const { services } = build();
    expect(services).toHaveLength(2);
    const week = services.find((s) => s.stops.length === 5)!;
    expect(week.days).toBe(1 | 2 | 4 | 8); // vendredi supprimé par exception
    expect(week.origin).toBe("Quiévrain");
    expect(week.terminus).toBe("Soignies");
    expect(week.stops[2]).toMatchObject({ n: "Ghlin", p: 1 });
    expect(week.stationsKey).toContain("|bergen|");
    expect(week.passKey).toBe("|ghlin|");
    expect(week.series).toBe("1700-1749");
    const sat = services.find((s) => s.stops.length === 2)!;
    expect(sat.days).toBe(32);
    // Sans chemin Infrabel : type du GTFS seulement.
    expect(week.relation).toBe("IC");
    expect(week.relationSource).toBe("gtfs");
  });

  it("jointure Infrabel : relation, lignes par arrêt, relation unique pour les variantes", () => {
    const paths = d1([
      ["2026-10-13", "1706", "IC 14", "QUIEVRAIN", "", "97", "", "06:11:00"],
      ["2026-10-13", "1706", "IC 14", "SAINT-GHISLAIN", "97", "97", "06:27:00", "06:31:00"],
      ["2026-10-13", "1706", "IC 14", "JEMAPPES", "97", "97", "06:40:00", "06:40:00"],
      ["2026-10-13", "1706", "IC 14", "BERGEN", "96", "96", "06:45:00", "06:50:00"],
      ["2026-10-13", "1706", "IC 14", "ZINNIK", "96", "", "07:08:00", ""],
    ]).paths(OPS);
    const { services, relations } = build(paths);
    const week = services.find((s) => s.days === 15)!;
    expect(week).toMatchObject({
      relation: "IC14",
      type: "IC",
      relationSource: "infrabel",
      linesSource: "infrabel",
    });
    // Jemappes : traversée sans arrêt d'après Infrabel (absente du GTFS) → passage ajouté, sans heure.
    expect(week.stops.map((s) => `${s.n}${s.p ? "*" : ""}:${s.l ?? ""}`)).toEqual([
      "Quiévrain:97",
      "Saint-Ghislain:97",
      "Ghlin*:",
      "Jemappes*:97",
      "Mons:96",
      "Soignies:96",
    ]);
    expect(week.passKey).toBe("|ghlin|jemappes|");
    expect(week.linesKey).toBe("|97|96|");
    expect(relations).toHaveLength(1);
    expect(relations[0]).toMatchObject({
      key: "IC14",
      label: "Quiévrain – Soignies",
      trains: 1,
      series: ["1700-1749"],
    });
  });

  it("chemin Infrabel d'un autre trajet (n° réutilisé) : ignoré", () => {
    const paths = d1([
      ["2026-10-13", "1706", "EXTRA", "ZINNIK", "", "96", "", "06:11:00"],
      ["2026-10-13", "1706", "EXTRA", "Y.SAINT-GHISLAIN", "96", "96", "06:20:00", "06:20:00"],
      ["2026-10-13", "4000", "L 99", "QUIEVRAIN", "", "97", "", "09:00:00"],
      ["2026-10-13", "4000", "L 99", "SAINT-GHISLAIN", "97", "97", "09:10:00", "09:11:00"],
      ["2026-10-13", "4000", "L 99", "BERGEN", "96", "96", "09:20:00", "09:21:00"],
      ["2026-10-13", "4000", "L 99", "ZINNIK", "96", "", "09:40:00", ""],
    ]).paths(OPS);
    const { services } = build(paths);
    expect(services.every((s) => s.relationSource !== "infrabel")).toBe(true);
  });
});
