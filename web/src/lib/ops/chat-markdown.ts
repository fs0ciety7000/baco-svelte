// Markdown du Journal (demande du 9 oct. 2026 : messages avec emojis, Markdown, infos importantes). Analyse PURE en
// arbre (aucun HTML produit ni accepté) : le rendu construit des éléments React, qui échappent tout texte. Sous-ensemble
// volontairement court : gras, italique, barré, code, liens http(s), mentions « @ », listes, citations, titres, blocs
// de code. Une ligne = un retour à la ligne (habitude des messageries).

export type Inline =
  | { t: "text"; v: string }
  | { t: "b" | "i" | "s"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; label: string; url: string }
  | { t: "url"; v: string }
  | { t: "mention"; v: string }
  | { t: "br" };

export type Block =
  | { type: "p"; c: Inline[] }
  | { type: "h"; c: Inline[] }
  | { type: "ul"; items: Inline[][] }
  | { type: "ol"; items: Inline[][] }
  | { type: "quote"; c: Inline[] }
  | { type: "code"; v: string };

const INLINE =
  /(`[^`\n]+`)|\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]{1,500})\)|\*\*([^\n]+?)\*\*|~~([^\n]+?)~~|(?<![\w*])\*([^\s*][^*\n]*?)\*(?![\w*])|(?<!\w)_([^\s_][^_\n]*?)_(?!\w)|(https?:\/\/[^\s<>"]{3,300})|(?<![\w.-])(@[A-Za-z0-9_.-]{2,40})/g;

/** Lien affichable : http(s) seulement (jamais javascript:, data:…). */
export function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function parseInline(text: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  const push = (v: string) => {
    if (!v) return;
    const last = out[out.length - 1];
    if (last && last.t === "text") last.v += v;
    else out.push({ t: "text", v });
  };
  if (depth > 3) {
    push(text);
    return out;
  }
  const re = new RegExp(INLINE.source, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let token = m[0];
    let node: Inline | null = null;
    if (m[1]) node = { t: "code", v: m[1].slice(1, -1) };
    else if (m[2] && m[3]) node = { t: "link", label: m[2], url: m[3] };
    else if (m[4]) node = { t: "b", c: parseInline(m[4], depth + 1) };
    else if (m[5]) node = { t: "s", c: parseInline(m[5], depth + 1) };
    else if (m[6]) node = { t: "i", c: parseInline(m[6], depth + 1) };
    else if (m[7]) node = { t: "i", c: parseInline(m[7], depth + 1) };
    else if (m[8]) {
      // Ponctuation finale exclue du lien (« voir https://…. »).
      const url = m[8].replace(/[.,;:!?)\]]+$/, "");
      token = url;
      node = { t: "url", v: url };
    } else if (m[9]) {
      const v = m[9].replace(/[.-]+$/, "");
      token = v;
      node = { t: "mention", v };
    }
    push(text.slice(last, m.index));
    if (node) out.push(node);
    else push(token);
    last = m.index + token.length;
    re.lastIndex = last;
  }
  push(text.slice(last));
  return out;
}

function withBreaks(lines: string[]): Inline[] {
  const out: Inline[] = [];
  lines.forEach((l, i) => {
    if (i) out.push({ t: "br" });
    out.push(...parseInline(l));
  });
  return out;
}

const UL = /^\s*[-*•]\s+(.*)$/;
const OL = /^\s*\d{1,3}[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const HEADING = /^\s*#{1,3}\s+(.*)$/;

export function parseChatMarkdown(src: string): Block[] {
  const lines = String(src ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i] ?? "")) body.push(lines[i++] ?? "");
      i++; // clôture (ou fin du texte)
      blocks.push({ type: "code", v: body.join("\n") });
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      blocks.push({ type: "h", c: parseInline(h[1] ?? "") });
      i++;
      continue;
    }
    for (const [re, type] of [
      [UL, "ul"],
      [OL, "ol"],
    ] as const) {
      if (!re.test(line)) continue;
      const items: Inline[][] = [];
      while (i < lines.length && re.test(lines[i] ?? ""))
        items.push(parseInline(re.exec(lines[i++] ?? "")?.[1] ?? ""));
      blocks.push({ type, items });
      break;
    }
    if (UL.test(line) || OL.test(line)) continue;
    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i] ?? ""))
        quoted.push(QUOTE.exec(lines[i++] ?? "")?.[1] ?? "");
      blocks.push({ type: "quote", c: withBreaks(quoted) });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i] ?? "";
      if (!l.trim() || /^\s*```/.test(l) || HEADING.test(l) || UL.test(l) || OL.test(l)) break;
      if (QUOTE.test(l)) break;
      para.push(l);
      i++;
    }
    blocks.push({ type: "p", c: withBreaks(para) });
  }
  return blocks;
}

/** Texte brut d'un message (aperçus : widget, notifications) : marques Markdown retirées. */
export function plainText(src: string): string {
  const flat = (nodes: Inline[]): string =>
    nodes
      .map((n) =>
        n.t === "text" || n.t === "code" || n.t === "url" || n.t === "mention"
          ? n.v
          : n.t === "link"
            ? n.label
            : n.t === "br"
              ? " "
              : flat(n.c),
      )
      .join("");
  return parseChatMarkdown(src)
    .map((b) =>
      b.type === "code"
        ? b.v
        : b.type === "ul" || b.type === "ol"
          ? b.items.map(flat).join(" · ")
          : flat(b.c),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
