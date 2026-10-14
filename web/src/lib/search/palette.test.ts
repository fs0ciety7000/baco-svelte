import { describe, expect, it } from "vitest";

import {
  PALETTE_GROUPS,
  orderPaletteGroups,
  paletteGroupOrder,
  paletteHeading,
  parsePaletteQuery,
  rankStations,
  stationRank,
  uniqueBy,
  type PaletteGroupId,
} from "./palette";

describe("parsePaletteQuery", () => {
  it("refuse une saisie trop courte", () => {
    expect(parsePaletteQuery("")).toBeNull();
    expect(parsePaletteQuery(" a ")).toBeNull();
  });

  it("nettoie les espaces et borne la longueur", () => {
    const p = parsePaletteQuery("  Mons   Bergen  ")!;
    expect(p.q).toBe("Mons Bergen");
    expect(parsePaletteQuery("x".repeat(100))!.q).toHaveLength(60);
  });

  it("3 à 5 chiffres : n° de train, de bon et ligne courte", () => {
    const p = parsePaletteQuery("3804")!;
    expect(p.trainNumber).toBe(3804);
    expect(p.orderNumber).toBe(3804);
    expect(p.line).toBeNull();
    expect(p.text).toBe(false);
    const short = parsePaletteQuery("96")!;
    expect(short.trainNumber).toBe(96);
    expect(short.line).toBe("96");
    expect(parsePaletteQuery("123456")!.trainNumber).toBeNull();
    expect(parsePaletteQuery("123456")!.orderNumber).toBe(123456);
    expect(parsePaletteQuery("0000")!.trainNumber).toBeNull();
  });

  it("« L.96 », « L 96 », « l-124a » : ligne seulement", () => {
    for (const [q, line] of [
      ["L.96", "96"],
      ["L 96", "96"],
      ["l-124a", "124A"],
      ["L. 36", "36"],
    ] as const) {
      const p = parsePaletteQuery(q)!;
      expect(p.line).toBe(line);
      expect(p.lineOnly).toBe(true);
      expect(p.relation).toBeNull();
      expect(p.trainNumber).toBeNull();
    }
  });

  it("« L96 » : ligne, et relation omnibus pour 1 ou 2 chiffres", () => {
    expect(parsePaletteQuery("L96")).toMatchObject({
      line: "96",
      relation: "L96",
      lineOnly: false,
    });
    expect(parsePaletteQuery("L5")).toMatchObject({ line: "5", relation: "L05" });
    expect(parsePaletteQuery("L124")).toMatchObject({ line: "124", relation: null });
    expect(parsePaletteQuery("L124A")).toMatchObject({ line: "124A", relation: null });
  });

  it("relations IC (deux chiffres) et S", () => {
    expect(parsePaletteQuery("IC14")!.relation).toBe("IC14");
    expect(parsePaletteQuery("ic 4")!.relation).toBe("IC04");
    expect(parsePaletteQuery("IC-04")!.relation).toBe("IC04");
    expect(parsePaletteQuery("S1")!.relation).toBe("S1");
    expect(parsePaletteQuery("s 10")!.relation).toBe("S10");
    expect(parsePaletteQuery("S01")!.relation).toBe("S1");
    expect(parsePaletteQuery("IC14")!.text).toBe(false);
  });

  it("abréviation PtCar et texte libre", () => {
    expect(parsePaletteQuery("fms")).toMatchObject({ abbr: "FMS", text: true });
    expect(parsePaletteQuery("Mons")).toMatchObject({ abbr: "MONS", text: true });
    expect(parsePaletteQuery("Charleroi-Central")).toMatchObject({ abbr: null, text: true });
    expect(parsePaletteQuery("Liège")!.text).toBe(true);
    expect(parsePaletteQuery("TC_2026")).toMatchObject({ text: true, trainNumber: null });
  });
});

describe("ordre des groupes", () => {
  const order = (q: string) => paletteGroupOrder(parsePaletteQuery(q)!);

  it("contient chaque groupe une seule fois", () => {
    const all = Object.keys(PALETTE_GROUPS);
    for (const q of ["IC14", "L.96", "3804", "FMS", "Mons", "96"]) {
      const o = order(q);
      expect(new Set(o).size).toBe(o.length);
      expect([...o].sort()).toEqual([...all].sort());
    }
  });

  it("met en tête ce que la saisie désigne", () => {
    expect(order("IC14")[0]).toBe("relations");
    expect(order("L.96")[0]).toBe("lines");
    expect(order("L36").slice(0, 2)).toEqual(["relations", "lines"]);
    expect(order("3804").slice(0, 3)).toEqual(["live", "trains", "bus"]);
    expect(order("FMS").slice(0, 2)).toEqual(["stations", "ptcar"]);
    // Sans indice : ordre des modules (Commandes d'abord).
    expect(order("dupont")[0]).toBe("bus");
  });

  it("trie les groupes et retire les vides", () => {
    const g = (id: PaletteGroupId, n: number) => ({ id, items: Array.from({ length: n }) });
    const out = orderPaletteGroups(parsePaletteQuery("IC14")!, [
      g("bus", 2),
      g("journal", 0),
      g("relations", 1),
    ]);
    expect(out.map((x) => x.id)).toEqual(["relations", "bus"]);
  });

  it("en-tête « Module › Type »", () => {
    expect(paletteHeading("stations")).toBe("Ressources › Gares");
    expect(paletteHeading("suppliers")).toBe("Commandes › Fournisseurs");
    expect(paletteHeading("team")).toBe("Équipe › Agents");
  });
});

describe("rangement des gares", () => {
  const st = (name: string, abbr = "", nameNl = "", aliases: string[] = []) => ({
    name,
    abbr,
    nameNl,
    aliases,
  });
  const mons = st("Mons", "FMS", "Bergen");
  const monceau = st("Monceau", "FMC");
  const jemappes = st("Jemappes", "FJM");
  const ghlin = st("Ghlin", "FGH");
  const bxl = st("Bruxelles-Midi", "FBMZ", "Brussel-Zuid");

  it("abréviation exacte, puis début de nom, puis mot, puis contenu", () => {
    expect(stationRank(mons, "fms")).toBe(0);
    expect(stationRank(mons, "mon")).toBe(1);
    expect(stationRank(mons, "berg")).toBe(1);
    expect(stationRank(bxl, "midi")).toBe(2);
    expect(stationRank(bxl, "uxel")).toBe(3);
    expect(stationRank(ghlin, "mons")).toBe(-1);
    expect(stationRank(mons, "")).toBe(-1);
  });

  it("trie, retire les non-correspondances et borne", () => {
    const rows = [jemappes, monceau, ghlin, mons];
    expect(rankStations(rows, "FMS").map((s) => s.name)).toEqual(["Mons"]);
    expect(rankStations(rows, "mon").map((s) => s.name)).toEqual(["Monceau", "Mons"]);
    expect(rankStations(rows, "e", 2)).toHaveLength(2);
  });

  it("accents et tirets ignorés", () => {
    expect(stationRank(st("Liège-Guillemins", "GL"), "liege guil")).toBe(1);
  });
});

describe("uniqueBy", () => {
  it("garde la première variante de chaque train", () => {
    const rows = [
      { n: 1, d: "a" },
      { n: 1, d: "b" },
      { n: 2, d: "c" },
    ];
    expect(uniqueBy(rows, (r) => r.n)).toEqual([
      { n: 1, d: "a" },
      { n: 2, d: "c" },
    ]);
    expect(uniqueBy(rows, (r) => r.d, 2)).toHaveLength(2);
  });
});
