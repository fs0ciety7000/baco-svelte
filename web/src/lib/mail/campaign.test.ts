import { describe, expect, it } from "vitest";

import { DEFAULT_CAMPAIGN, firstNameOf, renderCampaign } from "./campaign";

describe("campagne d'e-mail", () => {
  it("rend le modèle par défaut avec le prénom, le bouton et une version texte", () => {
    const r = renderCampaign({
      ...DEFAULT_CAMPAIGN,
      firstName: "Alex",
      appUrl: "https://csm.fs0ciety.org",
    });
    expect(r.html).toContain("Bonjour Alex,");
    expect(r.html).toContain('href="https://csm.fs0ciety.org/"');
    expect(r.html).toContain("<strong>BACO laisse la place à CSM</strong>");
    expect(r.html).toContain("<ul");
    expect(r.text).toContain("- ton e-mail et ton mot de passe BACO");
    expect(r.text).toContain("Ouvrir CSM : https://csm.fs0ciety.org/");
  });

  it("échappe le HTML et refuse les liens non http(s)", () => {
    const r = renderCampaign({
      subject: "<b>Sujet</b>",
      body: "<script>alert(1)</script> [clic](javascript:alert(1))",
      firstName: "",
      appUrl: "javascript:alert(1)",
    });
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
    expect(r.html).not.toMatch(/href="javascript/);
    expect(r.html).toContain("&lt;b&gt;Sujet&lt;/b&gt;");
  });

  it("gère l'absence de prénom", () => {
    expect(
      renderCampaign({
        subject: "S",
        body: "Bonjour {prenom},",
        firstName: "",
        appUrl: "https://x.be",
      }).text,
    ).toContain("Bonjour,");
    expect(firstNameOf("  Marie Dupont ")).toBe("Marie");
  });
});
