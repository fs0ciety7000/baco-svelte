import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  applyFormat,
  B201_DISTRICTS,
  b201NotesOf,
  COMMON_NOTES_TITLE,
  legacyNotesToMarkdown,
  markdownToPdfLines,
  notesDistricts,
  noteSections,
  notesStats,
  parseVersions,
} from "./b201";
import { handoverText, type Handover } from "./handover";

type HookLib = {
  nextVersions: (
    stored: unknown,
    prev: { content: string; by: string; at: string },
    next: string,
    now: number,
  ) => { at: string; by: string; content: string }[];
  legacyToMarkdown: (notes: unknown) => string;
};
const hook = createRequire(import.meta.url)(
  path.resolve(process.cwd(), "../pocketbase/pb_hooks/lib/b201.js"),
) as HookLib;

describe("reprise des anciens commentaires de la B201", () => {
  const legacy = {
    matin: "Bus Mons → Quévy\r\nchauffeur prévenu",
    apres_midi: "",
    nuit: "  ",
    suivant: "- rappeler le dépôt",
  };

  it("un titre par période non vide, texte repris sans perte", () => {
    expect(legacyNotesToMarkdown(legacy)).toBe(
      "### Matin\nBus Mons → Quévy\nchauffeur prévenu\n\n### Pour le service suivant\n- rappeler le dépôt",
    );
    expect(legacyNotesToMarkdown(null)).toBe("");
    expect(legacyNotesToMarkdown({})).toBe("");
  });

  it("le hook PocketBase (et la migration) donnent le même texte", () => {
    expect(hook.legacyToMarkdown(legacy)).toBe(legacyNotesToMarkdown(legacy));
    expect(hook.legacyToMarkdown(JSON.stringify(legacy))).toBe(legacyNotesToMarkdown(legacy));
  });

  it("le Markdown enregistré l'emporte, sinon les anciens commentaires", () => {
    expect(b201NotesOf("Texte", legacy)).toBe("Texte");
    expect(b201NotesOf("  ", legacy)).toContain("### Matin");
    expect(b201NotesOf(undefined, undefined)).toBe("");
  });
});

describe("barre d'outils Markdown", () => {
  it("gras : entoure la sélection, puis la libère", () => {
    const a = applyFormat("bus annulé", 4, 10, "bold");
    expect(a).toEqual({ value: "bus **annulé**", start: 6, end: 12 });
    expect(applyFormat(a.value, a.start, a.end, "bold")).toEqual({
      value: "bus annulé",
      start: 4,
      end: 10,
    });
  });

  it("sans sélection : texte d'exemple sélectionné", () => {
    const a = applyFormat("", 0, 0, "italic");
    expect(a.value).toBe("_texte en italique_");
    expect(a.value.slice(a.start, a.end)).toBe("texte en italique");
  });

  it("listes : chaque ligne touchée, puis retirées", () => {
    const v = "Mons\nQuévy\n\nautre";
    const a = applyFormat(v, 0, 10, "ul");
    expect(a.value).toBe("- Mons\n- Quévy\n\nautre");
    expect(applyFormat(a.value, a.start, a.end, "ul").value).toBe(v);
    expect(applyFormat("a\nb", 0, 3, "ol").value).toBe("1. a\n2. b");
    // Une puce devient un numéro (pas « 1. - a »).
    expect(applyFormat("- a", 0, 3, "ol").value).toBe("1. a");
  });

  it("titre sur la ligne du curseur ; lien avec l'adresse sélectionnée", () => {
    expect(applyFormat("un\ndeux", 4, 4, "heading").value).toBe("un\n### deux");
    const l = applyFormat("voir doc", 5, 8, "link");
    expect(l.value).toBe("voir [doc](https://)");
    expect(l.value.slice(l.start, l.end)).toBe("https://");
  });
});

describe("PDF et versions", () => {
  it("Markdown aplati : titres gras, puces, liens lisibles", () => {
    const lines = markdownToPdfLines(
      "### Matin\nBus **annulé**\n\n- un\n- [doc](https://x.be)\n\n> cité",
    );
    expect(lines).toEqual([
      { text: "Matin", bold: true, gap: false },
      { text: "Bus annulé", gap: true },
      { text: "• un", indent: 1, gap: true },
      { text: "• doc (https://x.be)", indent: 1, gap: false },
      { text: "» cité", indent: 1, gap: true },
    ]);
  });

  it("versions : valides seulement, plus récente d'abord", () => {
    expect(
      parseVersions([
        { at: "2026-10-15 08:00:00.000Z", by: "a", content: "x" },
        { at: "2026-10-15 09:00:00.000Z", by: "b", content: "y" },
        { at: 3, content: "z" },
        null,
      ]).map((v) => v.content),
    ).toEqual(["y", "x"]);
    expect(parseVersions("[]")).toEqual([]);
  });

  it("hook : version gardée au changement d'auteur ou après 10 min, jamais pour un texte identique", () => {
    const t0 = Date.parse("2026-10-15T08:00:00Z");
    const prev = { content: "v1", by: "a", at: "2026-10-15 08:00:00.000Z" };
    const one = hook.nextVersions(null, prev, "v2", t0);
    expect(one).toEqual([prev]);
    // Même auteur, 2 min plus tard : pas de nouvelle version.
    expect(
      hook.nextVersions(
        one,
        { content: "v2", by: "a", at: "2026-10-15 08:01:00.000Z" },
        "v3",
        t0 + 120000,
      ),
    ).toHaveLength(1);
    // Autre auteur : nouvelle version.
    expect(
      hook.nextVersions(
        one,
        { content: "v2", by: "b", at: "2026-10-15 08:01:00.000Z" },
        "v3",
        t0 + 120000,
      ),
    ).toHaveLength(2);
    // Même auteur après 10 min : nouvelle version.
    expect(
      hook.nextVersions(
        one,
        { content: "v2", by: "a", at: "2026-10-15 08:11:00.000Z" },
        "v3",
        t0 + 11 * 60000,
      ),
    ).toHaveLength(2);
    expect(hook.nextVersions(one, prev, "v1", t0)).toEqual(one);
    // Texte précédent vide : rien à garder.
    expect(hook.nextVersions([], { content: " ", by: "a", at: "" }, "x", t0)).toEqual([]);
    // 30 au plus.
    const many = Array.from({ length: 40 }, (_, i) => ({
      at: `2026-10-15 0${i % 9}:00`,
      by: `u${i}`,
      content: "c",
    }));
    expect(hook.nextVersions(many, { content: "p", by: "z", at: "" }, "q", t0)).toHaveLength(30);
  });

  it("compteur de mots", () => {
    expect(notesStats("")).toEqual({ chars: 0, words: 0 });
    expect(notesStats("deux mots ")).toEqual({ chars: 10, words: 2 });
  });
});

describe("relève copiée sans les notes (15 oct. 2026)", () => {
  const h: Handover = {
    generatedAt: "2026-10-15T18:00:00Z",
    today: "2026-10-15",
    districts: [],
    toSend: [],
    running: [],
    upcoming: [],
    upcomingTotal: 0,
    delays: [],
    alea: [],
    aleaTotal: 0,
    log: [],
    disturbances: [],
  };
  it("seulement la synthèse : aucune section de notes", () => {
    const t = handoverText(h, { author: "A", at: "20:00", scope: "DSO" });
    expect(t).toContain("**Relève DSO**");
    expect(t).not.toContain("Notes");
    // Un appel d'avant (notes passées en trop) ne les ajoute pas non plus.
    const legacy = handoverText(h, {
      author: "A",
      at: "20:00",
      scope: "DSO",
      ...({ notes: "### Matin\nsecret" } as object),
    });
    expect(legacy).not.toContain("secret");
  });
});

describe("notes par district", () => {
  it("districts montrés : ceux demandés, ordre DSO, DSE, DCE ; tous si aucun", () => {
    expect(notesDistricts(["DCE", "DSO"])).toEqual(["DSO", "DCE"]);
    expect(notesDistricts(["dse", "DSE"])).toEqual(["DSE"]);
    expect(notesDistricts([])).toEqual([...B201_DISTRICTS]);
    expect(notesDistricts(["DNO"])).toEqual([...B201_DISTRICTS]);
  });

  it("sections du PDF : notes communes d'abord, puis un titre par district (même vide)", () => {
    const s = noteSections("### Matin\nancien", [
      { district: "DSO", content: "a", meta: "Dernière modification à 10:00." },
      { district: "DSE", content: "" },
    ]);
    expect(s.map((x) => x.title)).toEqual([
      COMMON_NOTES_TITLE,
      "Notes DSO · Sud-Ouest",
      "Notes DSE · Sud-Est",
    ]);
    expect(s[1]?.meta).toBe("Dernière modification à 10:00.");
    expect(s[2]).not.toHaveProperty("meta");
    expect(noteSections("  ", [{ district: "DCE", content: "x" }]).map((x) => x.title)).toEqual([
      "Notes DCE · Centre",
    ]);
  });
});
