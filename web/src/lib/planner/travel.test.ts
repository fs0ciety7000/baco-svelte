import { describe, expect, it } from "vitest";
import { BASES, agent } from "./test-fixtures";
import { coverage, isBaseStation, travelMinutes } from "./travel";
import type { PlannerBase } from "./types";

const mons = agent("m", "OPI", "FMS");
const tournai = agent("t", "CPI", "FTY");
const charleroi = agent("c", "OPI", "FCR");
const braine = agent("b", "CPI", "FBC");

describe("travelMinutes", () => {
  it("matrice de la base (aller depuis la base, valable au retour), gare de base = 0", () => {
    expect(travelMinutes("FMS", "Mons", "La Louvière-Sud", BASES)).toBe(40);
    expect(travelMinutes("FMS", "La Louvière-Sud", "Mons", BASES)).toBe(40);
    expect(travelMinutes("FMS", "Mons", "MONS", BASES)).toBe(0);
    expect(travelMinutes("FCR", "Charleroi-Central", "Nivelles", BASES)).toBe(40);
    expect(travelMinutes(BASES[0]!, "Mons", "saint ghislain", BASES)).toBe(25);
  });

  it("gare secondaire → gare secondaire : passage par la base (somme)", () => {
    expect(travelMinutes("FMS", "Saint-Ghislain", "La Louvière-Sud", BASES)).toBe(65);
    expect(travelMinutes("FCR", "Nivelles", "Luttre", BASES)).toBe(70);
  });

  it("entrée directe d'une autre matrice (gare de base ↔ gare) plutôt que le détour", () => {
    // Mons : Ath 50 + Tournai 50 = 100 par la base, mais Tournai → Ath = 40 dans la matrice de Tournai.
    expect(travelMinutes("FMS", "Ath", "Tournai", BASES)).toBe(40);
  });

  it("base couverte : par la base voisine (deux sens)", () => {
    // Mons → Mouscron = Mons → Tournai 50 + Tournai → Mouscron 35.
    expect(travelMinutes("FMS", "Mons", "Mouscron", BASES)).toBe(85);
    // Tournai → Saint-Ghislain = Tournai → Mons 50 (matrice de Mons) + 25.
    expect(travelMinutes("FTY", "Tournai", "Saint-Ghislain", BASES)).toBe(75);
    // Entre deux gares de Tournai pour un agent de Mons : par Tournai (35 + 35), pas par Mons.
    expect(travelMinutes("FMS", "Mouscron", "Leuze", BASES)).toBe(70);
  });

  it("null hors couverture ou base inconnue", () => {
    expect(travelMinutes("FMS", "Mons", "Charleroi-Central", BASES)).toBeNull();
    expect(travelMinutes("FCR", "Charleroi-Central", "La Louvière-Sud", BASES)).toBeNull();
    expect(travelMinutes("FCR", "Nivelles", "Mons", BASES)).toBeNull();
    expect(travelMinutes("XXX", "Mons", "Mons", BASES)).toBeNull();
  });
});

describe("coverage (réponses de l'utilisateur du 15 oct. 2026)", () => {
  it("gare de base, matrice, base couverte", () => {
    expect(coverage(mons, "Mons", BASES)).toMatchObject({ ok: true, viaBase: null, minutes: 0 });
    expect(coverage(mons, "Ath", BASES)).toMatchObject({ ok: true, viaBase: null, minutes: 50 });
    expect(coverage(mons, "Mouscron", BASES)).toMatchObject({
      ok: true,
      viaBase: "FTY",
      minutes: 85,
    });
  });

  it("Mons ↔ Tournai dans les deux sens", () => {
    expect(coverage(mons, "Tournai", BASES).ok).toBe(true);
    expect(coverage(tournai, "Mons", BASES).ok).toBe(true);
    expect(coverage(tournai, "Saint-Ghislain", BASES)).toMatchObject({ ok: true, viaBase: "FMS" });
  });

  it("La Louvière-Sud = Mons (jamais Charleroi) ; Ath = Tournai ou Mons", () => {
    expect(coverage(mons, "La Louvière-Sud", BASES).ok).toBe(true);
    expect(coverage(charleroi, "La Louvière-Sud", BASES).ok).toBe(false);
    expect(coverage(mons, "Ath", BASES).ok).toBe(true);
    expect(coverage(tournai, "Ath", BASES).ok).toBe(true);
  });

  it("jamais Mons → Charleroi, jamais Charleroi → zone FMS", () => {
    expect(coverage(mons, "Charleroi-Central", BASES)).toEqual({
      ok: false,
      viaBase: null,
      minutes: null,
      reason: "Hors zone : Mons ne couvre pas Charleroi-Central",
    });
    expect(coverage(mons, "Nivelles", BASES).ok).toBe(false);
    for (const s of ["Mons", "Saint-Ghislain", "Jurbise", "Soignies", "Cambron-Casteau"])
      expect(coverage(charleroi, s, BASES).ok).toBe(false);
    expect(coverage(charleroi, "Mons", BASES).reason).toBe(
      "Hors zone : Charleroi-Central ne couvre pas Mons",
    );
  });

  it("une base non couverte reste hors zone (Braine-le-Comte n'atteint pas Mouscron)", () => {
    expect(coverage(braine, "Soignies", BASES).ok).toBe(true);
    expect(coverage(braine, "Mouscron", BASES).ok).toBe(false);
  });

  it("couverture déclarée sans trajet vers la base couverte : ignorée", () => {
    const bases: PlannerBase[] = [
      { code: "AAA", name: "Gare A", district: "X", covers: ["BBB"], travel: [] },
      {
        code: "BBB",
        name: "Gare B",
        district: "X",
        covers: [],
        travel: [{ station: "Gare C", minutes: 10 }],
      },
    ];
    expect(coverage({ base: "AAA" }, "Gare C", bases).ok).toBe(false);
    expect(coverage({ base: "ZZZ" }, "Gare C", bases)).toMatchObject({
      ok: false,
      reason: "Base ZZZ inconnue",
    });
  });

  it("code de base accepté comme gare", () => {
    expect(coverage(mons, "FTY", BASES).ok).toBe(true);
    expect(isBaseStation(BASES[0]!, "FMS")).toBe(true);
    expect(isBaseStation(BASES[0]!, "mons")).toBe(true);
    expect(isBaseStation(BASES[0]!, "Ath")).toBe(false);
  });
});
