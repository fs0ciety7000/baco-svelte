import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  contactTitle,
  FOLD_OVER,
  groupByService,
  groupByZone,
  mapLegacy,
  mineFilter,
  NO_ZONE,
  normZone,
  parseZoneParam,
  sameZones,
  serviceCounts,
  shortServiceLabel,
  zoneLabel,
  zoneMatches,
  zoneParam,
  zonesOfDistricts,
  type DirectoryService,
  type DirectoryZone,
  type Groupable,
} from "./directory-model";

// Bibliothèque des hooks PocketBase (reprise de la migration 1760005200 et import différentiel) : même résultat attendu.
type HookLib = {
  mapLegacy: (c: unknown, g: unknown, z: unknown) => Record<string, string>;
  legacyNote: (note: unknown, mapped: Record<string, string>) => string;
  cleanFunctions: (list: unknown) => string[] | null;
  SEED: [string, string, number, string[]][];
};
const hook = createRequire(import.meta.url)(
  path.resolve(process.cwd(), "../pocketbase/pb_hooks/lib/directory.js"),
) as HookLib;

// Fixtures fictives couvrant chaque cas de la reprise (catégorie, groupe, zone → service, fonction, zone).
const CASES: [string, string, string, string, string, string][] = [
  // MIA : « SPI|CPI|OPI|PA <zone> » → gares, fonction = préfixe, zone de la fiche sinon le code.
  ["MIA", "SPI FMS", "", "gares", "SPI", "FMS"],
  ["MIA", "CPI FCR", "fcr", "gares", "CPI", "FCR"],
  ["MIA", "OPI FNR", "", "gares", "OPI", "FNR"],
  ["MIA", "PA FTY", "", "gares", "PA", "FTY"],
  ["MIA", "PA LVRS", "FMS", "gares", "PA", "FMS"],
  ["MIA", "SPI GV", "", "gares", "SPI", "GV"],
  ["MIA", "TL/MPI", "FCR", "gares", "TL/MPI", "FCR"],
  ["MIA", "France", "", "etranger", "France", ""],
  ["MIA", "Help desk", "", "support", "Help desk", ""],
  ["MIA", "Bureau inconnu", "", "", "Bureau inconnu", ""],
  // RCC-OCC : trafic, fonction = groupe (« Repartiteurs » → « Répartiteurs »).
  ["RCC-OCC", "RTS ROC", "", "trafic", "RTS ROC", ""],
  ["RCC-OCC", "Repartiteurs", "", "trafic", "Répartiteurs", ""],
  ["RCC-OCC", "PACO", "FMS", "trafic", "PACO", "FMS"],
  ["RCC-OCC", "Permanence 3x8", "FR / LK", "trafic", "Permanence 3x8", "FR / LK"],
  ["RCC-OCC", "CPC", "", "trafic", "CPC", ""],
  // B-TO : triage.
  ["B-TO", "Operator Shunting Yards zone FMS", "", "triage", "Operator", "FMS"],
  ["B-TO", "Collaborator Shunting Yards zone FCR", "", "triage", "Collaborator", "FCR"],
  ["B-TO", "Zone Mons", "", "triage", "", "FMS"],
  ["B-TO", "Zone FCR", "", "triage", "", "FCR"],
  ["B-TO", "", "", "triage", "", ""],
  // Borne PMR, quelle que soit la catégorie.
  ["Borne PMR", "Borne PMR", "FTY", "pmr", "Borne PMR", "FTY"],
  ["Autre", "Borne PMR", "", "pmr", "Borne PMR", ""],
  ["", "Borne PMR", "", "pmr", "Borne PMR", ""],
  // Autre.
  ["Autre", "PMR", "", "pmr", "PMR", ""],
  ["Autre", "B-Clean UP ( de 09h00 à 17h00 )", "", "support", "B-Clean UP", ""],
  ["Autre", "Charleroi", "", "support", "", "FCR"],
  ["Autre", "Gares", "", "support", "Gares", ""],
  ["Autre", "B-CS", "", "support", "B-CS", ""],
  ["Autre", "Soutien psychologique", "", "support", "Soutien psychologique", ""],
  ["Autre", "France", "", "etranger", "France", ""],
  ["Autre", "Help desk", "", "support", "Help desk", ""],
  // Inconnu : à classer, fonction = groupe.
  ["Divers", "Bureau X", "fl", "", "Bureau X", "FL"],
];

describe("reprise des anciens champs de l'annuaire (mapLegacy)", () => {
  it.each(CASES)("%s / %s / %s", (c, g, z, service, fn, zone) => {
    expect(mapLegacy(c, g, z)).toMatchObject({ service, function: fn, zone });
    // Miroir exact des hooks PocketBase (migration + import différentiel).
    const h = hook.mapLegacy(c, g, z);
    expect({ service: h.service, function: h.function, zone: h.zone }).toEqual({
      service,
      function: fn,
      zone,
    });
    expect(h.hours).toBe(mapLegacy(c, g, z).hours);
  });

  it("chaque service de la reprise existe dans l'amorce", () => {
    const keys = new Set(hook.SEED.map((s) => s[0]));
    for (const [c, g, z] of CASES) {
      const s = mapLegacy(c, g, z).service;
      if (s) expect(keys.has(s)).toBe(true);
    }
  });

  it("B-Clean UP : plage horaire en tête de la remarque, une seule fois", () => {
    const m = hook.mapLegacy("Autre", "B-Clean UP ( de 09h00 à 17h00 )", "");
    expect(hook.legacyNote("", m)).toBe("9 h – 17 h");
    expect(hook.legacyNote("Appeler le chef d'équipe", m)).toBe(
      "9 h – 17 h · Appeler le chef d'équipe",
    );
    expect(hook.legacyNote("Présent de 9h à 17h", m)).toBe("Présent de 9h à 17h");
    expect(hook.legacyNote("Note", hook.mapLegacy("RCC-OCC", "PACO", ""))).toBe("Note");
  });

  it("fonctions proposées nettoyées (hook)", () => {
    expect(hook.cleanFunctions([" SPI ", "spi", "", 3, "CPI"])).toEqual(["SPI", "CPI"]);
    expect(hook.cleanFunctions("SPI")).toBeNull();
  });

  it("zone en majuscules", () => {
    expect(normZone("  fms ")).toBe("FMS");
    expect(normZone("fr / lk")).toBe("FR / LK");
  });
});

const ZONES: DirectoryZone[] = [
  { code: "FMS", name: "Mons", district: "DSO", color: "#d9b92c" },
  { code: "FCR", name: "Charleroi", district: "DSO", color: "#4f9e2f" },
  { code: "FNR", name: "Namur", district: "DSE", color: "#e9658d" },
];
const zoneMap = new Map(ZONES.map((z) => [z.code, z]));
const SERVICES: DirectoryService[] = [
  { key: "gares", label: "Gares & accueil", sort: 10, functions: ["SPI", "CPI", "PA"] },
  { key: "trafic", label: "Trafic RCC-OCC", sort: 20, functions: ["RTS ROC", "PACO"] },
];

let n = 0;
const row = (p: Partial<Groupable>): Groupable => ({
  id: `c${String(++n).padStart(14, "0")}`,
  name: "",
  service: "",
  function: "",
  zone: "",
  ...p,
});

describe("zones", () => {
  it("libellés", () => {
    expect(zoneLabel("FMS", zoneMap)).toBe("FMS · Mons");
    expect(zoneLabel("FB", zoneMap)).toBe("FB");
    expect(zoneLabel("", zoneMap)).toBe("Sans zone");
  });

  it("mes zones = zones de mes districts + sans zone", () => {
    const mine = zonesOfDistricts(ZONES, ["DSO"]);
    expect(mine).toEqual(["FMS", "FCR"]);
    const f = mineFilter(mine);
    expect(zoneMatches("FMS", f)).toBe(true);
    expect(zoneMatches(NO_ZONE, f)).toBe(true);
    expect(zoneMatches("FNR", f)).toBe(false);
    expect(mineFilter([])).toBeNull();
  });

  it("paramètre d'URL ↔ filtre", () => {
    const mine = ["FMS", "FCR"];
    expect(sameZones(parseZoneParam([], mine), mineFilter(mine))).toBe(true);
    expect(parseZoneParam(["tous"], mine)).toBeNull();
    expect(parseZoneParam(["fnr", "-"], mine)).toEqual(["FNR", NO_ZONE]);
    expect(zoneParam(mineFilter(mine), mine)).toEqual([]);
    expect(zoneParam(null, mine)).toEqual(["tous"]);
    expect(zoneParam(["FNR", NO_ZONE], mine)).toEqual(["FNR", "-"]);
    // Sans district : « toutes » est le défaut.
    expect(zoneParam(null, [])).toEqual([]);
  });
});

describe("regroupements", () => {
  const spi = Array.from({ length: FOLD_OVER + 2 }, (_, i) =>
    row({
      name: `Gare ${String.fromCharCode(69 - i)}`,
      service: "gares",
      function: "SPI",
      zone: "FMS",
    }),
  );
  const list = [
    ...spi,
    row({ name: "Mons", service: "trafic", function: "PACO", zone: "FMS" }),
    row({ name: "Gare B", service: "gares", function: "PA", zone: "FMS" }),
    row({ name: "Namur", service: "trafic", function: "PACO", zone: "FNR" }),
    row({ name: "Bruxelles", service: "trafic", function: "RTS ROC", zone: "" }),
    row({ name: "Inconnue", service: "", function: "Bureau", zone: "FB" }),
  ];

  it("par zone : mes zones d'abord, codes inconnus puis sans zone ; services dans l'ordre ; fonction repliée", () => {
    const secs = groupByZone(list, { services: SERVICES, zones: zoneMap, mine: ["FMS"] });
    expect(secs.map((s) => s.key)).toEqual(["FMS", "FNR", "FB", ""]);
    expect(secs[0]).toMatchObject({
      label: "FMS · Mons",
      color: "#d9b92c",
      district: "DSO",
      count: 7,
    });
    const fms = secs[0]!;
    expect(fms.groups.map((g) => g.key)).toEqual(["gares", "trafic"]);
    const gares = fms.groups[0]!;
    // SPI (5 > 3) replié, puis PA (ordre des fonctions du service).
    expect(gares.items[0]).toMatchObject({ kind: "fold", fn: "SPI" });
    expect(gares.items[0]!.kind === "fold" && gares.items[0]!.entries.map((e) => e.name)).toEqual(
      spi.map((e) => e.name).sort((a, b) => a.localeCompare(b, "fr")),
    );
    expect(gares.items[1]).toMatchObject({ kind: "contact", entry: { name: "Gare B" } });
    expect(secs[2]!.groups[0]).toMatchObject({ key: "", label: "À classer" });
    expect(secs[3]).toMatchObject({ label: "Sans zone" });
  });

  it("3 contacts d'une même fonction ne sont pas repliés", () => {
    const three = spi.slice(0, FOLD_OVER);
    const secs = groupByZone(three, { services: SERVICES, zones: zoneMap });
    expect(secs[0]!.groups[0]!.items.every((i) => i.kind === "contact")).toBe(true);
  });

  it("par service : sous-groupes par zone, à classer en dernier", () => {
    const secs = groupByService(list, { services: SERVICES, zones: zoneMap, mine: ["FMS"] });
    expect(secs.map((s) => s.key)).toEqual(["gares", "trafic", ""]);
    expect(secs[1]!.groups.map((g) => g.label)).toEqual(["FMS · Mons", "FNR · Namur", "Sans zone"]);
    expect(secs[2]).toMatchObject({ label: "À classer", count: 1 });
  });

  it("compteurs par service", () => {
    const c = serviceCounts(list);
    expect(c.get("gares")).toBe(6);
    expect(c.get("trafic")).toBe(3);
    expect(c.get("")).toBe(1);
  });
});

describe("libellés", () => {
  it("titre « PACO · Mons », sans répéter la fonction", () => {
    expect(contactTitle({ name: "Mons", function: "PACO" })).toBe("PACO · Mons");
    expect(contactTitle({ name: "PACO Mons", function: "PACO" })).toBe("PACO Mons");
    expect(contactTitle({ name: "Mons", function: "" })).toBe("Mons");
  });

  it("libellé court des services d'origine seulement", () => {
    expect(shortServiceLabel("trafic", "Trafic RCC-OCC")).toBe("Trafic");
    expect(shortServiceLabel("support", "Services support")).toBe("Support");
    expect(shortServiceLabel("trafic", "Trafic et circulation")).toBe("Trafic et circulation");
    expect(shortServiceLabel("securite", "Sécurité")).toBe("Sécurité");
  });
});
