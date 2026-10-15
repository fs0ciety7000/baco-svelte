import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_TEMPLATES,
  DEFAULT_CAMPAIGN,
  firstNameOf,
  parseCampaign,
  renderCampaign,
} from "./campaign";

const render = (body: string, subject = "Objet", appUrl = "https://csm.fs0ciety.org") =>
  renderCampaign({ subject, body, firstName: "Alex", appUrl });

describe("campagne d'e-mail", () => {
  it("rend le modèle du jour J (bandeau, cartes, étapes, encadrés, bouton) et sa version texte", () => {
    expect(DEFAULT_CAMPAIGN.id).toBe("jour-j");
    const r = render(DEFAULT_CAMPAIGN.body, DEFAULT_CAMPAIGN.subject);
    expect(r.subject).toBe("À partir d'aujourd'hui, BACO devient CSM");
    expect(r.html).toContain("Bonjour Alex,");
    expect(r.html).toContain('class="csm-hero');
    expect(r.html.match(/class="csm-col"/g)).toHaveLength(6);
    expect(r.html).toContain('href="https://csm.fs0ciety.org/"');
    expect(r.html).toContain(">Ouvrir CSM</a>");
    // Un seul bouton (celui du texte), pas de bouton ajouté en fin d'e-mail.
    expect(r.html.match(/>Ouvrir CSM<\/a>/g)).toHaveLength(1);
    expect(r.html).toContain("prefers-color-scheme: dark");
    expect(r.html).not.toMatch(/<img|<script|url\(/i);
    expect(r.text).toContain("À partir d'aujourd'hui, BACO devient CSM\n=====");
    expect(r.text).toContain("Ouvrir CSM : https://csm.fs0ciety.org/");
    expect(r.text).toContain("1. Connecte-toi sur https://csm.fs0ciety.org");
    expect(r.text).toContain("🧭 Des menus clairs et Ctrl K");
    expect(r.text).toContain("[ Ce qui ne change pas ]");
    expect(r.text).not.toContain(":::");
    expect(r.text).not.toContain("**");
  });

  it("garde l'ancien modèle, rendu comme avant (titre = objet, bouton ajouté)", () => {
    const old = CAMPAIGN_TEMPLATES.find((t) => t.id === "annonce");
    expect(old).toBeDefined();
    const r = render(old!.body, old!.subject);
    expect(r.html).toContain("<strong>BACO laisse la place à CSM</strong>");
    expect(r.html).toContain("<ul");
    expect(r.html).toContain(">BACO devient CSM : ton nouvel outil Client Solutions</p>");
    expect(r.html).not.toContain(`class="csm-hero`);
    expect(r.html.match(/>Ouvrir CSM<\/a>/g)).toHaveLength(1);
    expect(r.text.startsWith("BACO devient CSM")).toBe(true);
    expect(r.text).toContain("- ton e-mail et ton mot de passe BACO");
    expect(r.text).toContain("Ouvrir CSM : https://csm.fs0ciety.org/");
  });

  it("découpe les blocs de mise en page", () => {
    const s = parseCampaign(
      [
        "Intro",
        "::: bandeau",
        "# Grand titre",
        "Sous-titre",
        ":::",
        "::: bouton [Aller](https://x.be/a)",
        "::: cartes",
        "### 🚌 Bus",
        "Texte bus",
        "### Sans icône",
        "Ligne 1",
        "Ligne 2",
        ":::",
        "::: étapes",
        "1. Un",
        "suite de un",
        "2. Deux",
        ":::",
        "::: encadré Titre",
        "- a",
        ":::",
        "::: inconnu",
        "Fin",
      ].join("\n"),
    );
    expect(s.map((x) => x.kind)).toEqual([
      "md",
      "bandeau",
      "bouton",
      "cartes",
      "etapes",
      "encadre",
      "md",
    ]);
    expect(s[1]).toEqual({ kind: "bandeau", title: "Grand titre", text: "Sous-titre" });
    expect(s[2]).toEqual({ kind: "bouton", label: "Aller", url: "https://x.be/a" });
    expect(s[3]).toEqual({
      kind: "cartes",
      cards: [
        { icon: "🚌", title: "Bus", body: "Texte bus" },
        { icon: "", title: "Sans icône", body: "Ligne 1\nLigne 2" },
      ],
    });
    expect(s[4]).toEqual({ kind: "etapes", steps: ["Un\nsuite de un", "Deux"] });
    expect(s[5]).toEqual({ kind: "encadre", title: "Titre", src: "- a" });
    // Nom inconnu : la ligne reste du texte.
    expect(s[6]).toEqual({ kind: "md", src: "::: inconnu\nFin" });
  });

  it("bloc non fermé : jusqu'à la fin du texte ; bandeau sans titre « # » : première ligne", () => {
    const s = parseCampaign("::: bandeau\nTitre seul\nSuite");
    expect(s).toEqual([{ kind: "bandeau", title: "Titre seul", text: "Suite" }]);
    expect(parseCampaign("::: etapes\n- a\n- b")).toEqual([{ kind: "etapes", steps: ["a", "b"] }]);
  });

  it("rend chaque bloc en HTML de messagerie", () => {
    const html = render(
      [
        "Texte",
        "::: bandeau",
        "# Titre du bandeau",
        "Accroche",
        ":::",
        "::: cartes",
        "### 📞 Annuaire",
        "Appel **en un clic**",
        ":::",
        "::: etapes",
        "1. Premier",
        "2. Second",
        ":::",
        "::: encadre Attention",
        "Texte de l'encadré",
        ":::",
      ].join("\n"),
    ).html;
    // Bandeau hors tête : bloc arrondi dans le contenu, le titre (objet) reste en haut.
    expect(html).toContain(">Objet</p>");
    expect(html).toContain("border-radius:8px");
    expect(html).toContain(">Titre du bandeau</p>");
    expect(html).toContain('aria-hidden="true">📞</td>');
    expect(html).toContain("Appel <strong>en un clic</strong>");
    expect(html).toContain("<!--[if mso]>");
    expect(html).toMatch(/>1<\/td>[\s\S]*>Premier<\/td>[\s\S]*>2<\/td>[\s\S]*>Second<\/td>/);
    expect(html).toContain('class="csm-soft"');
    expect(html).toContain(">Attention</p>");
    // Sans bouton dans le texte : bouton « Ouvrir CSM » ajouté.
    expect(html).toContain(">Ouvrir CSM</a>");
  });

  it("bandeau en tête : remplace le titre et sert de texte d'aperçu", () => {
    const r = render("::: bandeau\n# Grand jour\nTout est prêt.\n:::\nCorps");
    expect(r.html).not.toContain(">Objet</p>");
    expect(r.html).toContain("mso-hide:all");
    expect(r.html).toMatch(/mso-hide:all[^>]*>Tout est prêt\.<\/div>/);
    expect(r.text.startsWith("Grand jour\n==========\nTout est prêt.")).toBe(true);
  });

  it("échappe tout le texte des blocs et refuse les liens non http(s)", () => {
    const r = render(
      [
        "<script>alert(1)</script> [clic](javascript:alert(1))",
        "::: bandeau",
        '# <img src=x onerror="alert(1)">',
        ":::",
        "::: bouton [Piège](javascript:alert(1))",
        '::: bouton [<b>"x"</b>](https://ok.example/?a=1&b="2")',
        "::: cartes",
        "### <i>t</i>",
        "</td></tr></table><script>x</script>",
        ":::",
        "::: etapes",
        "1. <svg onload=alert(1)>",
        ":::",
        "::: encadre <b>titre</b>",
        "<style>body{}</style>",
        ":::",
      ].join("\n"),
      "<b>Sujet</b>",
      "javascript:alert(1)",
    );
    expect(r.html).not.toContain("<script>");
    expect(r.html).not.toContain("<img");
    expect(r.html).not.toContain("<svg");
    expect(r.html).not.toContain("<i>t</i>");
    expect(r.html).not.toContain("<b>");
    expect(r.html).not.toContain("<style>body");
    expect(r.html).not.toMatch(/href="javascript/);
    expect(r.html).toContain("&lt;script&gt;");
    expect(r.html).toContain("&lt;b&gt;Sujet&lt;/b&gt;");
    expect(r.html).toContain('href="https://ok.example/?a=1&amp;b=%222%22"');
    // Le bouton refusé reste visible en texte ; le lien d'en-tête retombe sur l'adresse de CSM.
    expect(r.html).toContain(">Piège</p>");
    expect(r.html).toContain('href="https://csm.fs0ciety.org"');
  });

  it("version texte des blocs", () => {
    const t = render(
      [
        "::: cartes",
        "### 🚌 Bus",
        "Bons **bus**",
        ":::",
        "::: etapes",
        "1. **Un**",
        "2. [Deux](https://x.be)",
        ":::",
        "::: encadre Note",
        "- point",
        ":::",
        "::: bouton [Ouvrir](https://x.be/o)",
        "## Titre",
      ].join("\n"),
    ).text;
    expect(t.startsWith("Objet\n\n🚌 Bus\nBons bus")).toBe(true);
    expect(t).toContain("1. Un\n2. Deux (https://x.be)");
    expect(t).toContain("[ Note ]\n- point");
    expect(t).toContain("Ouvrir : https://x.be/o");
    expect(t).toContain("TITRE");
    expect(t).not.toContain("Ouvrir CSM :");
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
    expect(firstNameOf("[x](https://piege.example)")).toBe("xhttps//piege.example");
    // Un nom ne peut pas ouvrir un bloc ni un titre.
    expect(firstNameOf(":::cartes")).toBe("cartes");
    expect(firstNameOf("#Titre")).toBe("Titre");
  });
});
