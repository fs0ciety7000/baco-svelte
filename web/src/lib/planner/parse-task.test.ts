import { describe, expect, it } from "vitest";
import type { StationRef } from "@/lib/stations/search";
import { at } from "./test-fixtures";
import { parseTaskLines } from "./parse-task";

const DAY = "2026-10-15";
const iso = (t: string) => new Date(at(t)).toISOString();
const REFS: StationRef[] = [
  { abbr: "FMS", names: ["Mons", "Bergen"] },
  { abbr: "FTY", names: ["Tournai", "Doornik"] },
  { abbr: "FCR", names: ["Charleroi-Central"] },
  { abbr: "LL", names: ["Libramont"] },
  { abbr: "FLV", names: ["La Louvière-Sud"] },
];
// Nominatif FICTIF : ne doit jamais ressortir.
const PERSONAL = /JEAN|TEST|0470000000|0470 00 00 00/;

describe("parseTaskLines", () => {
  it("ligne DICOS complète : IN de <GARE> à <autre gare> n°dossier nom téléphone", () => {
    const r = parseTaskLines(
      "1NV 07h16 906 IN de MONS à Charleroi-central n°2026-10-15-0001 JEAN TEST 0470000000",
      {
        day: DAY,
      },
    );
    expect(r.errors).toEqual([]);
    expect(r.ignoredPersonal).toBe(true);
    const t = r.tasks[0]!;
    expect(t).toMatchObject({
      line: 1,
      kind: "pmr_in",
      station: "MONS",
      otherStation: "Charleroi-central",
      train: "906",
      pmrType: "NV",
      pax: 1,
      light: true,
      dossier: "2026-10-15-0001",
      source: "manuel",
      status: "a_attribuer",
      ignoredPersonal: true,
    });
    expect(t.trainAt).toBe(at("07:16"));
    expect(t.start).toBe(iso("07:01"));
    expect(t.end).toBe(iso("07:21"));
    expect(JSON.stringify(r)).not.toMatch(PERSONAL);
  });

  it("OUT à <GARE> venant de <autre gare>, plusieurs types, « 10:16 », « n° » espacé", () => {
    const r = parseTaskLines(
      "1MR + 1DCO 10:16 E2129 OUT à TOURNAI venant de Mons n° 2026-10-15-0002",
      { day: DAY },
    );
    const t = r.tasks[0]!;
    expect(r.errors).toEqual([]);
    expect(t).toMatchObject({
      kind: "pmr_out",
      station: "TOURNAI",
      otherStation: "Mons",
      train: "E2129",
      pmrType: "MR",
      pax: 2,
      light: true,
      types: [
        { type: "MR", count: 1 },
        { type: "DCO", count: 1 },
      ],
      ignoredPersonal: false,
    });
    expect(t.start).toBe(iso("10:11"));
    expect(t.end).toBe(iso("10:31"));
  });

  it("fauteuil dans le mélange : fenêtre fauteuil, type le plus exigeant", () => {
    const r = parseTaskLines("2CRF+1CRP 06h20 908 (19909) IN DE Mons À Tournai", { day: DAY });
    expect(r.tasks[0]).toMatchObject({
      pmrType: "CRF",
      pax: 3,
      light: false,
      train: "908",
      station: "Mons",
    });
    expect(r.tasks[0]!.start).toBe(iso("06:00"));
    expect(r.tasks[0]!.end).toBe(iso("06:30"));
  });

  it("consigne des classeurs : « IN VERS LL » / « OUT DE LL » avec la gare du bloc", () => {
    const r = parseTaskLines(
      "1CRE 07h40 E2129 IN VERS LL 2026-10-15-0003\n1CRE 07h40 E2129 OUT DE LL",
      {
        day: DAY,
        station: "Arlon",
      },
    );
    expect(r.errors).toEqual([]);
    expect(r.tasks.map((t) => [t.kind, t.station, t.otherStation, t.dossier])).toEqual([
      ["pmr_in", "Arlon", "LL", "2026-10-15-0003"],
      ["pmr_out", "Arlon", "LL", undefined],
    ]);
    const missing = parseTaskLines("1CRE 07h40 E2129 IN VERS LL", { day: DAY });
    expect(missing.tasks).toEqual([]);
    expect(missing.errors[0]!.message).toMatch(/il manque la gare assistée/);
  });

  it("gares ramenées au référentiel (abréviation, nom NL, casse)", () => {
    const r = parseTaskLines("1NV 08h00 906 OUT à fms venant de doornik", {
      day: DAY,
      stations: REFS,
    });
    expect(r.tasks[0]).toMatchObject({ station: "Mons", otherStation: "Tournai" });
  });

  it("taxi : pas de train, attribué au taxi", () => {
    const r = parseTaskLines(
      "2CRF 17H05 TAXI OUT à LA LOUVIÈRE-SUD venant de Mons n° Informations sur le client JEAN TEST",
      { day: DAY },
    );
    const t = r.tasks[0]!;
    expect(t.train).toBeUndefined();
    expect(t.assignee).toEqual({ kind: "taxi", label: "Taxi" });
    expect(t.status).toBe("attribuee");
    expect(t.station).toBe("LA LOUVIÈRE-SUD");
    expect(t.dossier).toBeUndefined();
    expect(t.ignoredPersonal).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(PERSONAL);
    const plain = parseTaskLines(
      "1NV 06h30 TAXI IN de LA LOUVIÈRE-SUD à Mons n° Informations sur le client",
      { day: DAY },
    );
    expect(plain.tasks[0]!.ignoredPersonal).toBe(false);
  });

  it("sans « n° » : nom et téléphone séparés de la dernière gare, jamais renvoyés", () => {
    const cases = [
      "1NV 08h00 906 IN de MONS à Charleroi-Central JEAN TEST 0470000000",
      "1NV 08h00 906 IN de MONS à La Louvière-Sud JEAN TEST",
      "1NV 08h00 906 OUT à MONS JEAN TEST 0470 00 00 00",
    ];
    const r = parseTaskLines(cases.join("\n"), { day: DAY });
    expect(r.errors.filter((e) => e.level === "error")).toEqual([]);
    expect(r.tasks.map((t) => [t.station, t.otherStation ?? null, t.ignoredPersonal])).toEqual([
      ["MONS", "Charleroi-Central", true],
      ["MONS", "La Louvière-Sud", true],
      ["MONS", null, true],
    ]);
    expect(JSON.stringify(r)).not.toMatch(PERSONAL);
  });

  it("sans « n° », avec référentiel : plus longue suite de mots reconnue", () => {
    const r = parseTaskLines("1NV 08h00 906 IN de MONS à charleroi central JEAN TEST", {
      day: DAY,
      stations: REFS,
    });
    expect(r.tasks[0]).toMatchObject({
      station: "Mons",
      otherStation: "Charleroi-Central",
      ignoredPersonal: true,
    });
    expect(JSON.stringify(r)).not.toMatch(PERSONAL);
  });

  it("gare en majuscules de plusieurs mots sans référentiel : avertissement, nominatif écarté", () => {
    const r = parseTaskLines("1NV 08h00 906 IN de MONS à TOURNAI JEAN TEST", { day: DAY });
    expect(r.tasks[0]).toMatchObject({ otherStation: "TOURNAI", ignoredPersonal: true });
    expect(r.errors).toEqual([{ line: 1, level: "warn", message: "autre gare à vérifier" }]);
    expect(JSON.stringify(r)).not.toMatch(PERSONAL);
  });

  it("erreurs par ligne, en français, sans recopier la ligne", () => {
    const text = [
      "JEAN TEST 0470000000",
      "1NV IN de MONS",
      "1NV 07h16 IN de MONS à Ath",
      "1NV 07h16 906 de MONS à Ath",
      "1NV 07h16 906 IN MONS",
      "1NV 25h16 906 IN de MONS",
      "",
      "1XX 08h00 906 IN de MONS à Ath",
    ].join("\n");
    const r = parseTaskLines(text, { day: DAY });
    expect(r.errors).toEqual([
      { line: 1, level: "error", message: "il manque le type et le nombre de PMR (ex. 1NV)" },
      { line: 2, level: "error", message: "il manque l'heure du train (ex. 07h16)" },
      { line: 3, level: "error", message: "il manque le n° de train (ou TAXI)" },
      { line: 4, level: "error", message: "il manque le sens (IN ou OUT)" },
      { line: 5, level: "error", message: "il manque la gare (IN de <gare> à <autre gare>)" },
      { line: 6, level: "error", message: "heure du train illisible" },
      { line: 8, level: "warn", message: "type « XX » inconnu, compté comme PMR light" },
    ]);
    expect(r.tasks).toHaveLength(1);
    expect(r.tasks[0]).toMatchObject({ line: 8, light: true });
    expect(r.tasks[0]!.pmrType).toBeUndefined();
    expect(JSON.stringify(r)).not.toMatch(PERSONAL);
  });

  it("jour invalide, préfixe NUIT, heure d'hiver", () => {
    expect(
      parseTaskLines("1NV 07h16 906 IN de MONS", { day: "2026-13-01" }).errors[0]!.message,
    ).toBe("jour de service invalide");
    const night = parseTaskLines("1NV NUIT 05h10 906 IN de MONS", { day: DAY });
    expect(night.tasks[0]!.trainAt).toBe(at("05:10"));
    const winter = parseTaskLines("1NV 07h16 906 IN de MONS", { day: "2026-12-01" });
    expect(winter.tasks[0]!.trainAt).toBe("2026-12-01T06:16:00.000Z");
  });
});
