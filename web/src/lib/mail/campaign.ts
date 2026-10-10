import { parseChatMarkdown, safeHref, type Inline } from "@/lib/ops/chat-markdown";

// Campagnes d'e-mail (demande du 10 oct. 2026 : annoncer le passage de BACO à CSM, au design de CSM). Rendu PUR et testé :
// le texte de la campagne (Markdown du Journal) devient un e-mail HTML compatible avec les messageries (tableaux, styles
// en ligne, aucune image distante ni script) + une version texte. Tout texte est échappé. `{prenom}` est remplacé.

export const DEFAULT_CAMPAIGN = {
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
    "- reconnecte l'extension DICOS à ton compte (PMR › Extension DICOS) ;",
    "- coche tes districts du jour.",
    "",
    "À partir de maintenant, utilise CSM pour tout ton travail.",
  ].join("\n"),
};

const C = {
  bg: "#0D0B09",
  panel: "#FFFFFF",
  page: "#F4F1EC",
  fg: "#1B1814",
  muted: "#6B645B",
  accent: "#FAC13B",
  accentFg: "#0D0B09",
  border: "#E2DDD4",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inlineHtml(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.t) {
        case "text":
          return esc(n.v);
        case "b":
          return `<strong>${inlineHtml(n.c)}</strong>`;
        case "i":
          return `<em>${inlineHtml(n.c)}</em>`;
        case "s":
          return `<s>${inlineHtml(n.c)}</s>`;
        case "code":
          return `<code style="font-family:Consolas,monospace;background:${C.page};padding:0 3px">${esc(n.v)}</code>`;
        case "link": {
          const href = safeHref(n.url);
          return href
            ? `<a href="${esc(href)}" style="color:${C.fg};text-decoration:underline">${esc(n.label)}</a>`
            : esc(n.label);
        }
        case "url": {
          const href = safeHref(n.v);
          return href ? `<a href="${esc(href)}" style="color:${C.fg}">${esc(n.v)}</a>` : esc(n.v);
        }
        case "mention":
          return esc(n.v);
        case "br":
          return "<br>";
      }
    })
    .join("");
}

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

export type CampaignRender = { html: string; text: string; subject: string };

export function renderCampaign(input: {
  subject: string;
  body: string;
  firstName: string;
  appUrl: string;
}): CampaignRender {
  const name = input.firstName.trim() || "";
  const fill = (s: string) => s.replace(/\{prenom\}/g, name).replace(/Bonjour ,/g, "Bonjour,");
  const blocks = parseChatMarkdown(fill(input.body));
  const P = `margin:0 0 14px;font-size:15px;line-height:1.55;color:${C.fg}`;
  const htmlBlocks = blocks
    .map((b) => {
      switch (b.type) {
        case "p":
          return `<p style="${P}">${inlineHtml(b.c)}</p>`;
        case "h":
          return `<p style="${P};font-size:17px;font-weight:700">${inlineHtml(b.c)}</p>`;
        case "quote":
          return `<p style="${P};border-left:3px solid ${C.accent};padding-left:12px;color:${C.muted}">${inlineHtml(b.c)}</p>`;
        case "code":
          return `<pre style="${P};font-family:Consolas,monospace;background:${C.page};padding:10px;white-space:pre-wrap">${esc(b.v)}</pre>`;
        case "ul":
        case "ol": {
          const tag = b.type;
          return `<${tag} style="margin:0 0 14px;padding-left:22px;font-size:15px;line-height:1.55;color:${C.fg}">${b.items
            .map((it) => `<li style="margin:0 0 4px">${inlineHtml(it)}</li>`)
            .join("")}</${tag}>`;
        }
      }
    })
    .join("\n");
  const url = safeHref(input.appUrl) ?? "https://csm.fs0ciety.org";
  const subject = fill(input.subject).slice(0, 200);
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:Segoe UI,Helvetica,Arial,sans-serif">
<tr><td style="background:${C.bg};padding:20px 24px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="background:${C.accent};color:${C.accentFg};font-weight:800;font-size:20px;letter-spacing:1px;padding:8px 12px;font-family:Segoe UI,Helvetica,Arial,sans-serif">CSM</td>
<td style="padding-left:12px;color:#EDE7DC;font-size:14px;font-family:Segoe UI,Helvetica,Arial,sans-serif">Client Solutions · SNCB</td>
</tr></table></td></tr>
<tr><td style="background:${C.panel};padding:28px 24px 12px;border-left:1px solid ${C.border};border-right:1px solid ${C.border}">
<p style="margin:0 0 18px;font-size:21px;line-height:1.3;font-weight:700;color:${C.fg}">${esc(subject)}</p>
${htmlBlocks}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 18px"><tr><td style="background:${C.accent}">
<a href="${esc(url)}" style="display:inline-block;padding:13px 22px;color:${C.accentFg};font-weight:700;font-size:15px;text-decoration:none;font-family:Segoe UI,Helvetica,Arial,sans-serif">Ouvrir CSM</a>
</td></tr></table>
<p style="margin:0 0 16px;font-size:13px;color:${C.muted}">Adresse : <a href="${esc(url)}" style="color:${C.muted}">${esc(url.replace(/\/$/, ""))}</a></p>
</td></tr>
<tr><td style="background:${C.panel};padding:14px 24px 20px;border:1px solid ${C.border};border-top:1px solid ${C.border};font-size:12px;line-height:1.5;color:${C.muted}">
E-mail interne de l'équipe Client Solutions, envoyé depuis CSM. Développé par OCC MONS Studios.
</td></tr>
</table></td></tr></table>
</body></html>`;
  const text = [
    subject,
    "",
    ...blocks.map((b) =>
      b.type === "ul" || b.type === "ol"
        ? b.items
            .map((it, i) => `${b.type === "ol" ? `${i + 1}.` : "-"} ${inlineText(it)}`)
            .join("\n")
        : b.type === "code"
          ? b.v
          : inlineText(b.c),
    ),
    "",
    `Ouvrir CSM : ${url}`,
  ].join("\n\n");
  return { html, text, subject };
}

/** Prénom pour « Bonjour {prenom} » : premier mot du nom affiché (vide si inconnu). */
export const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? "";
