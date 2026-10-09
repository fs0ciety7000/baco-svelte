import { describe, expect, it } from "vitest";

import { parseChatMarkdown, parseInline, plainText, safeHref } from "./chat-markdown";

describe("Markdown du Journal", () => {
  it("gras, italique, barré, code, mention et lien", () => {
    expect(parseInline("**Voie 3** _fermée_ ~~annulé~~ `IC 2134` @jdupont")).toEqual([
      { t: "b", c: [{ t: "text", v: "Voie 3" }] },
      { t: "text", v: " " },
      { t: "i", c: [{ t: "text", v: "fermée" }] },
      { t: "text", v: " " },
      { t: "s", c: [{ t: "text", v: "annulé" }] },
      { t: "text", v: " " },
      { t: "code", v: "IC 2134" },
      { t: "text", v: " " },
      { t: "mention", v: "@jdupont" },
    ]);
    expect(parseInline("[Infrabel](https://infrabel.be/x) et https://irail.be.")).toEqual([
      { t: "link", label: "Infrabel", url: "https://infrabel.be/x" },
      { t: "text", v: " et " },
      { t: "url", v: "https://irail.be" },
      { t: "text", v: "." },
    ]);
  });

  it("ne prend ni les e-mails pour des mentions, ni les identifiants_à_tirets pour de l'italique", () => {
    expect(parseInline("jean@sncb.be")).toEqual([{ t: "text", v: "jean@sncb.be" }]);
    expect(parseInline("ligne_96_bis")).toEqual([{ t: "text", v: "ligne_96_bis" }]);
    expect(parseInline("2 * 3 * 4")).toEqual([{ t: "text", v: "2 * 3 * 4" }]);
  });

  it("aucun lien hors http(s), aucun HTML interprété", () => {
    expect(parseInline("[x](javascript:alert(1))")).toEqual([
      { t: "text", v: "[x](javascript:alert(1))" },
    ]);
    expect(parseInline("<img src=x onerror=alert(1)>")).toEqual([
      { t: "text", v: "<img src=x onerror=alert(1)>" },
    ]);
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("https://test-csm.fs0ciety.org/x")).toBe("https://test-csm.fs0ciety.org/x");
  });

  it("blocs : titre, listes, citation, code, paragraphe avec retours à la ligne", () => {
    const b = parseChatMarkdown(
      "# Consigne\n- Mons\n- Jurbise\n1. appeler\n2. noter\n> cité\nligne 1\nligne 2\n```\nbrut **pas gras**\n```",
    );
    expect(b.map((x) => x.type)).toEqual(["h", "ul", "ol", "quote", "p", "code"]);
    expect(b[1]).toEqual({
      type: "ul",
      items: [[{ t: "text", v: "Mons" }], [{ t: "text", v: "Jurbise" }]],
    });
    expect(b[4]).toEqual({
      type: "p",
      c: [{ t: "text", v: "ligne 1" }, { t: "br" }, { t: "text", v: "ligne 2" }],
    });
    expect(b[5]).toEqual({ type: "code", v: "brut **pas gras**" });
  });

  it("texte brut pour les aperçus", () => {
    expect(plainText("🚨 **Voie 3** fermée\n- [avis](https://x.be) @agent")).toBe(
      "🚨 Voie 3 fermée avis @agent",
    );
  });
});
