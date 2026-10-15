import {
  parseChatMarkdown,
  parseInline,
  safeHref,
  type Block,
  type Inline,
} from "@/lib/ops/chat-markdown";

// Campagnes d'e-mail (demande du 10 oct. 2026 : annoncer le passage de BACO à CSM, au design de CSM). Rendu PUR et testé :
// le texte de la campagne (Markdown du Journal + quelques blocs de mise en page, voir `parseCampaign`) devient un e-mail
// HTML compatible avec les messageries (tableaux, styles en ligne, aucune image distante ni script, Outlook bureau compris)
// + une version texte. Tout texte est échappé, seuls les liens http(s) sont gardés. `{prenom}` est remplacé.
//
// Blocs de mise en page (15 oct. 2026), une ligne `::: nom` ouvre, une ligne `:::` ferme (fin du texte sinon) :
//   ::: bandeau            → bandeau d'en-tête : ligne `# Titre` (ou la première ligne) puis le sous-titre.
//   ::: bouton [Libellé](https://…)   → bouton d'appel à l'action (une seule ligne, pas de fermeture).
//   ::: cartes             → cartes de nouveautés : chaque `### 🧭 Titre` ouvre une carte, les lignes suivantes sont
//                            son texte (Markdown). Emoji de tête = icône. 2 colonnes en bureau, 1 sur téléphone.
//   ::: etapes             → étapes numérotées : une ligne « 1. … » (ou « - … ») par étape.
//   ::: encadre Titre      → encadré (titre facultatif), contenu en Markdown.
// Un nom inconnu reste du texte. Sans bouton dans le texte, le bouton « Ouvrir CSM » est ajouté en fin d'e-mail (anciennes
// campagnes). Un bandeau en tête remplace le titre (l'objet) affiché en haut de l'e-mail.

export type CampaignTemplate = { id: string; label: string; subject: string; body: string };

const JOUR_J: CampaignTemplate = {
  id: "jour-j",
  label: "Basculement BACO → CSM (jour J)",
  subject: "À partir d'aujourd'hui, BACO devient CSM",
  body: [
    "::: bandeau",
    "# À partir d'aujourd'hui, BACO devient CSM",
    "Ton nouvel outil Client Solutions est prêt : tout ton travail se fait désormais dans CSM.",
    ":::",
    "",
    "Bonjour {prenom},",
    "",
    "C'est le grand jour : **CSM remplace BACO** pour toute l'équipe Client Solutions. Les mêmes missions, les mêmes données, dans un outil plus rapide et plus complet.",
    "",
    "::: encadre Ce qui ne change pas",
    "- **Ton identifiant et ton mot de passe** : ceux de BACO, repris tels quels.",
    "- **Tes données** : bons de bus et de taxi, missions PMR, Journal, annuaire et procédures t'attendent dans CSM.",
    ":::",
    "",
    "::: bouton [Ouvrir CSM](https://csm.fs0ciety.org)",
    "",
    "## Les principales nouveautés",
    "",
    "::: cartes",
    "### 🧭 Des menus clairs et Ctrl K",
    "Six modules : Accueil, Opérations, Commandes, PMR & Groupes, Réseau et Ressources. **Ctrl K** trouve un train, une gare, un bon, un collègue ou une procédure depuis n'importe quelle page.",
    "",
    "### ♿ Missions PMR et Groupes",
    "Synchronisés depuis DICOS par l'extension CSM : trajet, embarquement (IN) et débarquement (OUT), retard du train et **Export ALEA** prêt à encoder.",
    "",
    "### 🚌 Bons bus et taxi",
    "Brouillon → Terminé → Envoyé. **«\u00a0Valider l'envoi\u00a0»** prépare le brouillon Outlook avec le PDF joint. Lignes et arrêts proposés d'après les horaires, PDF archivés.",
    "",
    "### 💬 Journal, B201 et Ma journée",
    "Le Journal en fil de discussion (réponses, recherche, mentions @DSO), la B201 avec des notes par district et la frise de tes prises en charge du jour.",
    "",
    "### 🗺️ Réseau",
    "Trains en direct, horaires et relations (IC 14, S1…), lignes, gares, carte des passages à niveau avec leur borne kilométrique et zones SPI.",
    "",
    "### 📞 Annuaire et téléphone",
    "Recherche dès la première lettre (accents et fautes tolérés), favoris, et appel en un clic avec Genesys Cloud.",
    ":::",
    "",
    "**Et aussi** : connexion par passkey (empreinte ou code de ton appareil), CSM installable comme une application, et un nouveau design avec trois styles au choix (Signal, Quai, Cabine).",
    "",
    "## À faire à ta première connexion",
    "",
    "::: etapes",
    "1. **Connecte-toi** sur https://csm.fs0ciety.org avec ton identifiant et ton mot de passe BACO.",
    "2. **Installe ou reconnecte l'extension CSM** : menu de ton compte (ta photo en haut à droite) › Extension CSM. C'est elle qui synchronise DICOS.",
    "3. **Coche tes districts du jour** : la cloche et les filtres suivent tes districts.",
    ":::",
    "",
    "Envie d'un autre look ? Choisis ton style dans le menu de ton compte › **Affichage**.",
    "",
    "::: encadre Besoin d'aide ?",
    "Toutes les nouveautés sont expliquées sur la page **Nouveautés** (en bas de la barre latérale) : https://csm.fs0ciety.org/changelog",
    "Un souci de connexion ou une question ? Contacte un administrateur CSM.",
    ":::",
    "",
    "Bonne prise en main et bon service !",
    "L'équipe CSM",
  ].join("\n"),
};

const ANNONCE: CampaignTemplate = {
  id: "annonce",
  label: "Annonce « BACO devient CSM » (10 oct.)",
  subject: "BACO devient CSM : ton nouvel outil Client Solutions",
  body: [
    "Bonjour {prenom},",
    "",
    "**BACO laisse la place à CSM**, le nouvel outil de l'équipe Client Solutions. Tes données y ont été reprises : commandes de bus et de taxis, missions PMR, Journal, annuaire et procédures.",
    "",
    "**Ce qui ne change pas**",
    "- ton e-mail et ton mot de passe BACO fonctionnent tels quels ;",
    "- les mêmes modules, regroupés en six entrées.",
    "",
    "**Ce qui est nouveau**",
    "- les missions PMR et les groupes synchronisés depuis DICOS, avec les retards des trains ;",
    "- le Journal en fil de discussion, la relève de service et la frise « Ma journée » ;",
    "- la connexion par passkey (Windows Hello, Touch ID) et l'application installable sur téléphone.",
    "",
    "**À faire à ta première connexion**",
    "- reconnecte l'extension DICOS à ton compte (menu du compte › Extension CSM) ;",
    "- coche tes districts du jour.",
    "",
    "À partir de maintenant, utilise CSM pour tout ton travail.",
  ].join("\n"),
};

/** Modèles proposés pour une nouvelle campagne, le premier par défaut. */
export const CAMPAIGN_TEMPLATES: readonly CampaignTemplate[] = [JOUR_J, ANNONCE];
export const DEFAULT_CAMPAIGN = JOUR_J;

// Couleurs du design « Signal · Jour » (design/tokens.ts : accent pétrole) ; variantes sombres dans DARK_CSS.
const C = {
  page: "#F4F8F8",
  panel: "#FFFFFF",
  bar: "#14191C",
  fg: "#14191C",
  muted: "#4F575B",
  border: "#DADFDF",
  accent: "#00666B",
  accentFg: "#FFFFFF",
  soft: "#E6F1F1",
  iconBg: "#E0EEEE",
  heroText: "#D5ECEC",
  signal: "#F8BC49",
};
const FONT = "'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif";

const DARK_CSS = `@media (prefers-color-scheme: dark){
.csm-page{background:#0C0E12!important}
.csm-panel{background:#14161A!important;border-color:#2C2F35!important}
.csm-fg,.csm-fg p,.csm-fg li,.csm-text{color:#EBEDF0!important}
.csm-muted,.csm-muted a{color:#AFB3B9!important}
.csm-soft{background:#17282A!important}
.csm-icon{background:#1D3335!important}
.csm-link{color:#6CC9CE!important}
.csm-rule{border-color:#2C2F35!important}
.csm-hero{background:#0B5357!important}
}`;
const MOBILE_CSS = `@media (max-width:520px){
.csm-col{max-width:100%!important}
.csm-pad{padding-left:18px!important;padding-right:18px!important}
.csm-hero-title{font-size:23px!important}
.csm-wrap{padding:0!important}
}`;

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// ---------------------------------------------------------------------------------------------------------------------
// Analyse des blocs de mise en page

export type CampaignCard = { icon: string; title: string; body: string };
export type CampaignSegment =
  | { kind: "md"; src: string }
  | { kind: "bandeau"; title: string; text: string }
  | { kind: "bouton"; label: string; url: string }
  | { kind: "cartes"; cards: CampaignCard[] }
  | { kind: "etapes"; steps: string[] }
  | { kind: "encadre"; title: string; src: string };

const OPEN = /^\s*:::\s*([A-Za-zÀ-ÿ]+)\s*(.*?)\s*$/;
const CLOSE = /^\s*:::\s*$/;
const HEAD = /^\s*#{1,3}\s+(.*)$/;
const STEP = /^\s*(?:\d{1,3}[.)]|[-*•])\s+(.*)$/;
const BUTTON = /^\[([^\]\n]{1,80})\]\((\S{1,500})\)$/;
const ICON =
  /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|⃣|\p{Emoji_Modifier}|‍\p{Extended_Pictographic}|\p{Regional_Indicator})*)\s*/u;

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const KINDS = new Set(["bandeau", "bouton", "cartes", "etapes", "encadre"]);

/** Découpe le texte d'une campagne en blocs de mise en page et en morceaux de Markdown du Journal. */
export function parseCampaign(src: string): CampaignSegment[] {
  const lines = String(src ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const out: CampaignSegment[] = [];
  let md: string[] = [];
  const flush = () => {
    if (md.some((l) => l.trim())) out.push({ kind: "md", src: md.join("\n") });
    md = [];
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const m = OPEN.exec(line);
    const kind = m ? fold(m[1] ?? "") : "";
    if (!m || !KINDS.has(kind)) {
      md.push(line);
      i++;
      continue;
    }
    flush();
    const rest = m[2] ?? "";
    i++;
    if (kind === "bouton") {
      const b = BUTTON.exec(rest.trim());
      if (b) out.push({ kind: "bouton", label: b[1] ?? "", url: b[2] ?? "" });
      else if (rest.trim()) out.push({ kind: "md", src: rest });
      continue;
    }
    const inner: string[] = [];
    while (i < lines.length && !CLOSE.test(lines[i] ?? "")) inner.push(lines[i++] ?? "");
    i++; // fermeture (ou fin du texte)
    if (kind === "bandeau") {
      const filled = inner.filter((l) => l.trim());
      const hIdx = filled.findIndex((l) => HEAD.test(l));
      const titleLine = hIdx >= 0 ? (HEAD.exec(filled[hIdx] ?? "")?.[1] ?? "") : (filled[0] ?? "");
      const text = filled.filter((_, k) => k !== (hIdx >= 0 ? hIdx : 0)).map((l) => l.trim());
      out.push({ kind: "bandeau", title: titleLine.trim() || rest, text: text.join("\n") });
    } else if (kind === "cartes") {
      const cards: CampaignCard[] = [];
      let cur: { head: string; body: string[] } | null = null;
      const push = () => {
        if (!cur) return;
        const im = ICON.exec(cur.head);
        cards.push({
          icon: im ? (im[1] ?? "") : "",
          title: (im ? cur.head.slice(im[0].length) : cur.head).trim(),
          body: cur.body.join("\n").trim(),
        });
      };
      for (const l of inner) {
        const h = HEAD.exec(l);
        if (h) {
          push();
          cur = { head: (h[1] ?? "").trim(), body: [] };
        } else if (cur) cur.body.push(l);
        else if (l.trim()) cur = { head: "", body: [l] };
      }
      push();
      if (cards.length) out.push({ kind: "cartes", cards });
    } else if (kind === "etapes") {
      const steps: string[] = [];
      for (const l of inner) {
        if (!l.trim()) continue;
        const s = STEP.exec(l);
        if (s || !steps.length) steps.push((s ? (s[1] ?? "") : l).trim());
        else steps[steps.length - 1] += `\n${l.trim()}`;
      }
      if (steps.length) out.push({ kind: "etapes", steps });
    } else {
      out.push({ kind: "encadre", title: rest, src: inner.join("\n") });
    }
  }
  flush();
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Rendu HTML

type Tone = { color: string; link: string; linkClass: string };
const BODY_TONE: Tone = { color: C.fg, link: C.accent, linkClass: "csm-link" };
const HERO_TONE: Tone = { color: C.heroText, link: "#FFFFFF", linkClass: "" };

function inlineHtml(nodes: Inline[], tone: Tone = BODY_TONE): string {
  const a = (href: string, label: string) =>
    `<a href="${esc(href)}"${tone.linkClass ? ` class="${tone.linkClass}"` : ""} style="color:${tone.link};text-decoration:underline">${label}</a>`;
  return nodes
    .map((n) => {
      switch (n.t) {
        case "text":
          return esc(n.v);
        case "b":
          return `<strong>${inlineHtml(n.c, tone)}</strong>`;
        case "i":
          return `<em>${inlineHtml(n.c, tone)}</em>`;
        case "s":
          return `<s>${inlineHtml(n.c, tone)}</s>`;
        case "code":
          return `<code style="font-family:Consolas,monospace;background:${C.soft};padding:0 3px">${esc(n.v)}</code>`;
        case "link": {
          const href = safeHref(n.url);
          return href ? a(href, esc(n.label)) : esc(n.label);
        }
        case "url": {
          const href = safeHref(n.v);
          return href ? a(href, esc(n.v.replace(/^https?:\/\//, ""))) : esc(n.v);
        }
        case "mention":
          return esc(n.v);
        case "br":
          return "<br>";
      }
    })
    .join("");
}

/** Texte avec retours à la ligne (une ligne = un retour, comme le Journal). */
const linesInline = (src: string): Inline[] => {
  const out: Inline[] = [];
  src.split("\n").forEach((l, k) => {
    if (k) out.push({ t: "br" });
    out.push(...parseInline(l));
  });
  return out;
};

function blocksHtml(blocks: Block[], size = 15): string {
  const P = `margin:0 0 14px;font-size:${size}px;line-height:1.55;color:${C.fg}`;
  return blocks
    .map((b) => {
      switch (b.type) {
        case "p":
          return `<p style="${P}">${inlineHtml(b.c)}</p>`;
        case "h":
          return `<p style="margin:28px 0 14px;font-size:${size + 3}px;line-height:1.3;font-weight:700;color:${C.fg};border-left:4px solid ${C.accent};padding-left:10px">${inlineHtml(b.c)}</p>`;
        case "quote":
          return `<p class="csm-muted" style="${P};border-left:3px solid ${C.accent};padding-left:12px;color:${C.muted}">${inlineHtml(b.c)}</p>`;
        case "code":
          return `<pre style="${P};font-family:Consolas,monospace;background:${C.soft};padding:10px;white-space:pre-wrap">${esc(b.v)}</pre>`;
        case "ul":
        case "ol": {
          const tag = b.type;
          return `<${tag} style="margin:0 0 14px;padding-left:22px;font-size:${size}px;line-height:1.55;color:${C.fg}">${b.items
            .map((it) => `<li style="margin:0 0 6px">${inlineHtml(it)}</li>`)
            .join("")}</${tag}>`;
        }
      }
    })
    .join("\n");
}

/** Bouton « à l'épreuve d'Outlook » : couleur sur la cellule, marge interne aussi pour Outlook (mso-padding-alt). */
function buttonHtml(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 22px"><tr><td bgcolor="${C.accent}" style="background:${C.accent};border-radius:6px;mso-padding-alt:13px 26px">
<a href="${esc(href)}" style="display:inline-block;padding:13px 26px;color:${C.accentFg};font-weight:700;font-size:16px;line-height:1.2;text-decoration:none;font-family:${FONT};border-radius:6px">${esc(label)}</a>
</td></tr></table>`;
}

function heroHtml(s: { title: string; text: string }, flush: boolean): string {
  const t = parseInline(s.title);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"${flush ? "" : ' style="margin:0 0 22px"'}><tr><td class="csm-hero csm-pad" bgcolor="${C.accent}" style="background:${C.accent};padding:34px 30px 30px;${flush ? "" : "border-radius:8px;"}font-family:${FONT}">
<p class="csm-hero-title" style="margin:0;font-size:27px;line-height:1.25;font-weight:700;color:#FFFFFF">${inlineHtml(t, { ...HERO_TONE, color: "#FFFFFF" })}</p>
${s.text ? `<p style="margin:12px 0 0;font-size:16px;line-height:1.5;color:${C.heroText}">${inlineHtml(linesInline(s.text), HERO_TONE)}</p>` : ""}
</td></tr>
<tr><td height="4" bgcolor="${C.signal}" style="background:${C.signal};height:4px;line-height:4px;font-size:0">&nbsp;</td></tr></table>`;
}

function cardHtml(c: CampaignCard): string {
  const icon = c.icon
    ? `<td width="40" valign="top" style="padding:0 12px 0 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td class="csm-icon" width="40" height="40" align="center" valign="middle" bgcolor="${C.iconBg}" style="background:${C.iconBg};border-radius:8px;width:40px;height:40px;font-size:20px;line-height:40px;text-align:center" aria-hidden="true">${esc(c.icon)}</td></tr></table></td>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="csm-rule" style="border-top:3px solid ${C.accent};padding:14px 14px 18px 0;font-family:${FONT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px"><tr>${icon}<td class="csm-text" valign="middle" style="font-size:16px;line-height:1.3;font-weight:700;color:${C.fg}">${inlineHtml(parseInline(c.title))}</td></tr></table>
${blocksHtml(parseChatMarkdown(c.body), 14).replace(/margin:0 0 14px/g, "margin:0 0 8px")}
</td></tr></table>`;
}

/** Cartes en colonnes « hybrides » : blocs en ligne de 270 px qui passent à la ligne d'eux-mêmes sur un écran étroit ;
 *  Outlook bureau (pas de max-width) reçoit un tableau fantôme de 2 colonnes par commentaires conditionnels. */
function cardsHtml(cards: CampaignCard[]): string {
  const W = 270;
  const parts: string[] = [
    '<!--[if mso]><table role="presentation" width="540" cellpadding="0" cellspacing="0"><tr><![endif]-->',
  ];
  cards.forEach((c, k) => {
    if (k && k % 2 === 0) parts.push("<!--[if mso]></tr><tr><![endif]-->");
    parts.push(
      `<!--[if mso]><td width="${W}" valign="top"><![endif]--><div class="csm-col" style="display:inline-block;width:100%;max-width:${W}px;vertical-align:top">${cardHtml(c)}</div><!--[if mso]></td><![endif]-->`,
    );
  });
  parts.push("<!--[if mso]></tr></table><![endif]-->");
  return `<div style="font-size:0;line-height:0;margin:0 0 10px">${parts.join("")}</div>`;
}

function stepsHtml(steps: string[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">${steps
    .map(
      (
        s,
        k,
      ) => `<tr><td width="30" valign="top" style="padding:0 14px 14px 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="30" height="30" align="center" valign="middle" bgcolor="${C.accent}" style="background:${C.accent};border-radius:15px;width:30px;height:30px;color:${C.accentFg};font-size:15px;line-height:30px;font-weight:700;text-align:center;font-family:${FONT}">${k + 1}</td></tr></table></td>
<td class="csm-text" valign="top" style="padding:4px 0 14px;font-size:15px;line-height:1.55;color:${C.fg};font-family:${FONT}">${inlineHtml(linesInline(s))}</td></tr>`,
    )
    .join("")}</table>`;
}

function calloutHtml(title: string, src: string): string {
  const body = blocksHtml(parseChatMarkdown(src));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px"><tr><td class="csm-soft" bgcolor="${C.soft}" style="background:${C.soft};border-left:4px solid ${C.accent};border-radius:6px;padding:16px 18px 4px;font-family:${FONT}">
${title ? `<p style="margin:0 0 10px;font-size:16px;line-height:1.3;font-weight:700;color:${C.fg}">${inlineHtml(parseInline(title))}</p>` : ""}${body}
</td></tr></table>`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Version texte

function inlineText(nodes: Inline[]): string {
  return nodes
    .map((n) =>
      n.t === "text" || n.t === "code" || n.t === "mention" || n.t === "url"
        ? n.v
        : n.t === "link"
          ? `${n.label} (${n.url})`
          : n.t === "br"
            ? "\n"
            : inlineText(n.c),
    )
    .join("");
}

const blocksText = (blocks: Block[]) =>
  blocks.map((b) =>
    b.type === "ul" || b.type === "ol"
      ? b.items
          .map((it, i) => `${b.type === "ol" ? `${i + 1}.` : "-"} ${inlineText(it)}`)
          .join("\n")
      : b.type === "code"
        ? b.v
        : b.type === "h"
          ? inlineText(b.c).toUpperCase()
          : inlineText(b.c),
  );

const mdText = (src: string) => blocksText(parseChatMarkdown(src)).join("\n\n");
const plainInline = (src: string) => inlineText(linesInline(src));

function segmentText(s: CampaignSegment): string {
  switch (s.kind) {
    case "md":
      return mdText(s.src);
    case "bandeau": {
      const t = plainInline(s.title);
      return [t, "=".repeat(Math.min(60, t.length)), s.text ? plainInline(s.text) : ""]
        .filter(Boolean)
        .join("\n");
    }
    case "bouton":
      return `${s.label} : ${safeHref(s.url) ?? s.url}`;
    case "cartes":
      return s.cards
        .map((c) => `${c.icon ? `${c.icon} ` : "- "}${plainInline(c.title)}\n${mdText(c.body)}`)
        .join("\n\n");
    case "etapes":
      return s.steps.map((st, k) => `${k + 1}. ${plainInline(st)}`).join("\n");
    case "encadre":
      return [s.title ? `[ ${plainInline(s.title)} ]` : "", mdText(s.src)]
        .filter(Boolean)
        .join("\n");
  }
}

// ---------------------------------------------------------------------------------------------------------------------

export type CampaignRender = { html: string; text: string; subject: string };

export function renderCampaign(input: {
  subject: string;
  body: string;
  firstName: string;
  appUrl: string;
}): CampaignRender {
  const name = input.firstName.trim() || "";
  const fill = (s: string) => s.replace(/\{prenom\}/g, name).replace(/Bonjour ,/g, "Bonjour,");
  const segments = parseCampaign(fill(input.body));
  const url = safeHref(input.appUrl) ?? "https://csm.fs0ciety.org";
  const subject = fill(input.subject).slice(0, 200);

  const first = segments[0];
  const hero = first?.kind === "bandeau" ? first : null;
  const rest = hero ? segments.slice(1) : segments;
  const hasButton = segments.some((s) => s.kind === "bouton" && safeHref(s.url));

  const content = rest
    .map((s) => {
      switch (s.kind) {
        case "md":
          return blocksHtml(parseChatMarkdown(s.src));
        case "bandeau":
          return heroHtml(s, false);
        case "bouton": {
          const href = safeHref(s.url);
          return href
            ? buttonHtml(s.label, href)
            : `<p style="margin:0 0 14px;font-size:15px;color:${C.fg}">${esc(s.label)}</p>`;
        }
        case "cartes":
          return cardsHtml(s.cards);
        case "etapes":
          return stepsHtml(s.steps);
        case "encadre":
          return calloutHtml(s.title, s.src);
      }
    })
    .join("\n");

  const preheader = hero?.text
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.page}">${esc(plainInline(hero.text))}</div>`
    : "";

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(subject)}</title>
<style>${DARK_CSS}
${MOBILE_CSS}</style></head>
<body class="csm-page" style="margin:0;padding:0;background:${C.page}">
${preheader}
<table role="presentation" class="csm-page" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.page}" style="background:${C.page}"><tr><td class="csm-wrap" align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:${FONT}">
<tr><td class="csm-pad" bgcolor="${C.bar}" style="background:${C.bar};padding:16px 28px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td bgcolor="${C.accent}" style="background:${C.accent};color:${C.accentFg};font-weight:800;font-size:18px;letter-spacing:1px;padding:6px 10px;border-radius:4px;font-family:${FONT}">CSM</td>
<td style="padding-left:12px;color:#C9D1D3;font-size:14px;font-family:${FONT}">Client Solutions · SNCB</td>
</tr></table></td></tr>
${hero ? `<tr><td>${heroHtml(hero, true)}</td></tr>` : ""}
<tr><td class="csm-panel csm-pad csm-fg" bgcolor="${C.panel}" style="background:${C.panel};padding:28px 28px 12px;border-left:1px solid ${C.border};border-right:1px solid ${C.border};color:${C.fg}">
${hero ? "" : `<p style="margin:0 0 18px;font-size:21px;line-height:1.3;font-weight:700;color:${C.fg}">${esc(subject)}</p>`}
${content}
${hasButton ? "" : buttonHtml("Ouvrir CSM", url)}
<p class="csm-muted" style="margin:0 0 16px;font-size:13px;color:${C.muted}">Adresse : <a href="${esc(url)}" style="color:${C.muted}">${esc(url.replace(/\/$/, ""))}</a></p>
</td></tr>
<tr><td class="csm-panel csm-pad csm-muted csm-rule" bgcolor="${C.panel}" style="background:${C.panel};padding:14px 28px 20px;border:1px solid ${C.border};font-size:12px;line-height:1.5;color:${C.muted}">
E-mail interne de l'équipe Client Solutions, envoyé depuis CSM. Développé par CM Interactive, une division de CARDOR Media.
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;

  const text = [
    ...(hero ? [] : [subject]),
    ...segments.map(segmentText),
    ...(hasButton ? [] : [`Ouvrir CSM : ${url}`]),
    `Adresse : ${url}`,
  ]
    .filter((s) => s.trim())
    .join("\n\n");
  return { html, text, subject };
}

/** Prénom pour « Bonjour {prenom} » : premier mot du nom affiché (vide si inconnu). */
export const firstNameOf = (name: string) =>
  // Sans caractères Markdown : un nom ne doit pas pouvoir fabriquer un lien ou de la mise en forme (revue sécurité).
  (name.trim().split(/\s+/)[0] ?? "").replace(/[[\]()*_~`<>@:#]/g, "").slice(0, 40);
