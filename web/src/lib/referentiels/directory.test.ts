import { describe, expect, it } from "vitest";

import {
  buildIndex,
  editDistance,
  foldText,
  foldWithMap,
  highlightPhone,
  highlightText,
  isPhoneQuery,
  MAX_FAVORITES,
  MAX_RECENT,
  parseQuery,
  phoneDigits,
  pushRecent,
  readDirectoryPrefs,
  searchDirectory,
  stationAliasesFor,
  stationAliasIndex,
  suggestQuery,
  toggleFavorite,
  type DirectoryEntry,
} from "./directory";

// Données fictives.
let n = 0;
const entry = (p: Partial<DirectoryEntry>): DirectoryEntry => ({
  id: `c${String(++n).padStart(14, "0")}`,
  name: "",
  phone: "",
  email: "",
  category: "",
  zone: "",
  group: "",
  note: "",
  aliases: [],
  ...p,
});

const liege = entry({
  name: "Gare de Liège-Guillemins — guichet",
  category: "GARE",
  group: "Gares",
  phone: "04/229.11.22",
});
const mons = entry({
  name: "Chef de gare Mons",
  category: "GARE",
  group: "Chefs de gare",
  phone: "+32 65 58 12 34",
  aliases: ["FMS", "Bergen"],
});
const monsMia = entry({
  name: "MIA Hainaut Ouest — permanence",
  category: "MIA",
  zone: "Hainaut Ouest",
  group: "MIA",
  phone: "0475 12 34 56",
  note: "Couvre Mons et Tournai",
});
const dispatch = entry({
  name: "Dispatching Infrabel Sud",
  category: "SERVICE",
  group: "Dispatching",
  phone: "02 525 11 11",
  email: "dispatch.sud@exemple.test",
});
const securail = entry({
  name: "Securail Hainaut",
  category: "SÉCURITÉ",
  group: "Securail",
  phone: "071 23 45 67",
});
const louviere = entry({ name: "Gare de La Louvière-Sud", category: "GARE", group: "Gares" });
const mosans = entry({ name: "Cars Mosans", category: "BUS", group: "Sociétés de bus" });
const all = [liege, mons, monsMia, dispatch, securail, louviere, mosans];
const index = buildIndex(all);
const find = (q: string, opts = {}) =>
  searchDirectory(index, parseQuery(q), opts).map((h) => h.entry);

describe("normalisation", () => {
  it("replie accents, casse, ligatures et ponctuation", () => {
    expect(foldText("Liège-Guillemins — Œuvre")).toBe("liege guillemins oeuvre");
    expect(foldText("  SÉCURITÉ  ")).toBe("securite");
  });
  it("garde la position d'origine de chaque caractère", () => {
    const { folded, map } = foldWithMap("Æ-b");
    expect(folded).toBe("ae b");
    expect(map).toEqual([0, 0, 1, 2]);
  });
  it("met un numéro sous forme nationale", () => {
    expect(phoneDigits("+32 65 58 12 34")).toBe("065581234");
    expect(phoneDigits("0032 65 58 12 34")).toBe("065581234");
    expect(phoneDigits("065/58.12.34")).toBe("065581234");
    expect(phoneDigits("3200")).toBe("3200");
  });
  it("reconnaît une saisie de numéro", () => {
    expect(isPhoneQuery("065 58")).toBe(true);
    expect(isPhoneQuery("+32 65")).toBe(true);
    expect(isPhoneQuery("065/58.12")).toBe(true);
    expect(isPhoneQuery("12")).toBe(false);
    expect(isPhoneQuery("mons 065")).toBe(false);
  });
  it("mesure les fautes de frappe (transposition comprise)", () => {
    expect(editDistance("mosn", "mons")).toBe(1);
    expect(editDistance("liegge", "liege")).toBe(1);
    expect(editDistance("abc", "xyz", 1)).toBe(2);
  });
});

describe("recherche", () => {
  it("ignore accents et casse", () => {
    expect(find("liege")).toEqual([liege]);
    expect(find("SECURITE")).toEqual([securail]);
  });
  it("accepte les mots dans le désordre", () => {
    expect(find("sud infrabel")).toEqual([dispatch]);
    expect(find("guichet liège")).toEqual([liege]);
  });
  it("tolère une faute de frappe", () => {
    expect(find("dispacthing")).toEqual([dispatch]);
    expect(find("secrail")).toEqual([securail]);
  });
  it("trouve par numéro avec ou sans espaces, +32 ou 0", () => {
    expect(find("065 58 12")).toEqual([mons]);
    expect(find("+32 65 58")).toEqual([mons]);
    expect(find("065581234")).toEqual([mons]);
    expect(find("0475123456")).toEqual([monsMia]);
    expect(find("525 11")).toEqual([dispatch]);
  });
  it("trouve une gare par son abréviation PtCar ou son nom néerlandais", () => {
    expect(find("FMS")).toEqual([mons]);
    expect(find("bergen")).toEqual([mons]);
  });
  it("trouve par fonction, catégorie, zone, e-mail ou remarque", () => {
    expect(find("hainaut ouest")).toEqual([monsMia]);
    expect(find("dispatch.sud")).toEqual([dispatch]);
    expect(find("tournai")).toEqual([monsMia]);
  });
  it("classe le nom avant la remarque", () => {
    expect(find("mons")).toEqual([mons, monsMia]);
  });
  it("ne tolère les fautes que si rien ne correspond exactement", () => {
    expect(find("mons")).not.toContain(mosans);
    expect(find("mosns")).toContain(mons);
  });
  it("applique les filtres de la page avant le second passage", () => {
    const keep = (e: DirectoryEntry) => e.category === "SÉCURITÉ";
    expect(find("hainaut", { keep })).toEqual([securail]);
    expect(find("hainuat", { keep })).toEqual([securail]);
  });
  it("accepte la forme compacte d'un nom composé", () => {
    expect(find("lalouviere")).toEqual([louviere]);
  });
  it("fait passer un favori devant à pertinence égale", () => {
    const res = find("gare", { favorites: [louviere.id] });
    expect(res[0]).toBe(louviere);
  });
  it("sans saisie : toutes les fiches par ordre alphabétique", () => {
    const res = find("");
    expect(res).toHaveLength(all.length);
    expect(res[0]).toBe(mosans);
  });
  it("propose une correction quand rien ne correspond", () => {
    expect(find("mosnx")).toEqual([]);
    expect(suggestQuery(index, parseQuery("mosnx"))).toBe("mons");
    expect(suggestQuery(index, parseQuery("securaill hainot"))).toBe("securail hainaut");
    expect(suggestQuery(index, parseQuery("zzzzzz"))).toBeNull();
  });
});

describe("surlignage", () => {
  it("surligne la saisie repliée dans le texte d'origine", () => {
    const seg = highlightText("Gare de Liège-Guillemins", parseQuery("liege guil"));
    expect(seg.filter((s) => s.hit).map((s) => s.text)).toEqual(["Liège", "Guil"]);
  });
  it("surligne les chiffres d'un numéro malgré la ponctuation et l'indicatif", () => {
    const seg = highlightPhone("+32 65 58 12 34", parseQuery("065 58"));
    expect(seg.filter((s) => s.hit).map((s) => s.text)).toEqual(["65 58"]);
    const seg2 = highlightPhone("065/58.12.34", parseQuery("5812"));
    expect(seg2.filter((s) => s.hit).map((s) => s.text)).toEqual(["58.12"]);
  });
});

describe("alias de gare", () => {
  const idx = stationAliasIndex([
    { abbr: "FMS", names: ["Mons", "Bergen"] },
    { abbr: "FCR", names: ["Charleroi-Central", "Charleroi-Centraal"] },
    { abbr: "LZ", names: ["Ath", "Aat"] },
  ]);
  it("ajoute l'abréviation et les autres noms des gares citées (mots entiers)", () => {
    expect(stationAliasesFor("Chef de gare Mons", idx)).toEqual(["FMS", "Bergen"]);
    expect(stationAliasesFor("Gare de Charleroi-Central", idx)).toEqual([
      "FCR",
      "Charleroi-Centraal",
    ]);
    expect(stationAliasesFor("Athus PN 12", idx)).toEqual([]);
  });
});

describe("favoris et récents", () => {
  const a = "aaaaaaaaaaaaaaa";
  const b = "bbbbbbbbbbbbbbb";
  it("lit les préférences de façon défensive", () => {
    expect(readDirectoryPrefs(null)).toEqual({ favorites: [], recent: [] });
    expect(readDirectoryPrefs({ directory: { favorites: [a, a, "x", 3], recent: [b] } })).toEqual({
      favorites: [a],
      recent: [b],
    });
  });
  it("bascule un favori dans la limite", () => {
    expect(toggleFavorite([], a)).toEqual([a]);
    expect(toggleFavorite([a, b], a)).toEqual([b]);
    const full = Array.from({ length: MAX_FAVORITES }, (_, i) => String(i).padStart(15, "0"));
    expect(toggleFavorite(full, a)).toHaveLength(MAX_FAVORITES);
  });
  it("met la fiche consultée en tête des récents", () => {
    expect(pushRecent([a, b], b)).toEqual([b, a]);
    const many = Array.from({ length: 20 }, (_, i) => String(i).padStart(15, "0"));
    expect(pushRecent(many, a)).toHaveLength(MAX_RECENT);
  });
});
