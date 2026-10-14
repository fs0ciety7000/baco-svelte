import { parseChatMarkdown, type Inline } from "./chat-markdown";

// B201 (15 oct. 2026 : la Relève devient « B201 » et ses notes du jour remplacent les commentaires par période de
// l'ancienne remise). Logique PURE partagée client / serveur : reprise des anciens commentaires en Markdown, barre
// d'outils de l'éditeur, texte du PDF, versions du jour. Le Markdown est celui du Journal (`chat-markdown.ts`).

/** Longueur maximale des notes d'un jour (miroir du champ `b201_reports.content`). */
export const B201_NOTES_MAX = 20000;

/** Anciens commentaires de la remise B201 (une zone par période + « pour le service suivant »). */
export type LegacyB201Notes = {
  matin?: string;
  apres_midi?: string;
  nuit?: string;
  suivant?: string;
};

const LEGACY_SECTIONS: [keyof LegacyB201Notes, string][] = [
  ["matin", "Matin"],
  ["apres_midi", "Après-midi"],
  ["nuit", "Nuit"],
  ["suivant", "Pour le service suivant"],
];

/**
 * Anciens commentaires → Markdown, sans perte : un titre par période non vide, texte repris tel quel (les retours à la
 * ligne sont gardés : une ligne = un retour à la ligne dans ce Markdown). Miroir de la migration `1760004830`.
 */
export function legacyNotesToMarkdown(notes: unknown): string {
  if (!notes || typeof notes !== "object") return "";
  const n = notes as Record<string, unknown>;
  return LEGACY_SECTIONS.map(([key, title]) => {
    const v = typeof n[key] === "string" ? (n[key] as string).replace(/\r\n?/g, "\n").trim() : "";
    return v ? `### ${title}\n${v}` : "";
  })
    .filter(Boolean)
    .join("\n\n");
}

/** Notes à afficher : le Markdown s'il existe, sinon les anciens commentaires convertis (fiche reprise de BACO). */
export function b201NotesOf(content: unknown, legacy: unknown): string {
  const c = typeof content === "string" ? content : "";
  return c.trim() ? c : legacyNotesToMarkdown(legacy);
}

// ---------------------------------------------------------------------------------------------------
// Barre d'outils de l'éditeur (gras, italique, listes, titre, lien) : opère sur le texte et la sélection.

export type FormatKind = "bold" | "italic" | "ul" | "ol" | "heading" | "link";
export type Edit = { value: string; start: number; end: number };

const WRAP: Partial<Record<FormatKind, string>> = { bold: "**", italic: "_" };
const LINE_PREFIX: Partial<Record<FormatKind, RegExp>> = {
  ul: /^\s*[-*•]\s+/,
  ol: /^\s*\d{1,3}[.)]\s+/,
  heading: /^\s*#{1,3}\s+/,
};

/**
 * Applique un format à la sélection `[start, end)` de `value`. Gras / italique : entoure (ou retire si déjà entouré) ;
 * listes / titre : préfixe chaque ligne touchée (ou retire le préfixe si toutes l'ont) ; lien : `[texte](https://)` avec
 * l'adresse sélectionnée pour la saisir. Renvoie le texte et la nouvelle sélection.
 */
export function applyFormat(value: string, start: number, end: number, kind: FormatKind): Edit {
  const a = Math.max(0, Math.min(start, end, value.length));
  const b = Math.min(value.length, Math.max(start, end));
  const sel = value.slice(a, b);
  const wrap = WRAP[kind];
  if (wrap) {
    const w = wrap.length;
    // Déjà entouré (marques juste autour de la sélection, ou dans la sélection) : on retire.
    if (value.slice(a - w, a) === wrap && value.slice(b, b + w) === wrap)
      return {
        value: value.slice(0, a - w) + sel + value.slice(b + w),
        start: a - w,
        end: b - w,
      };
    if (sel.length > 2 * w && sel.startsWith(wrap) && sel.endsWith(wrap)) {
      const inner = sel.slice(w, -w);
      return { value: value.slice(0, a) + inner + value.slice(b), start: a, end: a + inner.length };
    }
    const text = sel || (kind === "bold" ? "texte en gras" : "texte en italique");
    return {
      value: value.slice(0, a) + wrap + text + wrap + value.slice(b),
      start: a + w,
      end: a + w + text.length,
    };
  }
  if (kind === "link") {
    const label = sel.trim() || "lien";
    const url = "https://";
    const ins = `[${label}](${url})`;
    const urlAt = a + label.length + 3;
    return {
      value: value.slice(0, a) + ins + value.slice(b),
      start: urlAt,
      end: urlAt + url.length,
    };
  }
  // Préfixe de ligne : lignes entières de la sélection.
  const lineStart = value.lastIndexOf("\n", a - 1) + 1;
  const nl = value.indexOf("\n", b > a && value[b - 1] === "\n" ? b - 1 : b);
  const lineEnd = nl < 0 ? value.length : nl;
  const lines = value.slice(lineStart, lineEnd).split("\n");
  const re = LINE_PREFIX[kind]!;
  const filled = lines.filter((l) => l.trim());
  const all = filled.length > 0 && filled.every((l) => re.test(l));
  const strip = (l: string) =>
    l.replace(LINE_PREFIX.ul!, "").replace(LINE_PREFIX.ol!, "").replace(LINE_PREFIX.heading!, "");
  let n = 0;
  const next = lines.map((l) => {
    if (all) return l.replace(re, "");
    if (!l.trim() && lines.length > 1) return l;
    n++;
    const body = strip(l);
    return kind === "ul" ? `- ${body}` : kind === "ol" ? `${n}. ${body}` : `### ${body}`;
  });
  const block = next.join("\n");
  return {
    value: value.slice(0, lineStart) + block + value.slice(lineEnd),
    start: lineStart,
    end: lineStart + block.length,
  };
}

// ---------------------------------------------------------------------------------------------------
// PDF : lignes de texte (aucune mise en forme riche dans le PDF, mais titres en gras et puces gardés).

export type PdfLine = { text: string; bold?: boolean; indent?: number; gap?: boolean };

function flat(nodes: Inline[]): string {
  return nodes
    .map((n) =>
      n.t === "text" || n.t === "code" || n.t === "url" || n.t === "mention"
        ? n.v
        : n.t === "link"
          ? `${n.label} (${n.url})`
          : n.t === "br"
            ? "\n"
            : flat(n.c),
    )
    .join("");
}

/** Markdown du Journal → lignes du PDF : titres en gras, puces « • » / numéros, citations « » », blocs séparés. */
export function markdownToPdfLines(src: string): PdfLine[] {
  const out: PdfLine[] = [];
  const push = (text: string, o: Omit<PdfLine, "text"> = {}) =>
    text.split("\n").forEach((t, i) => out.push({ text: t, ...o, gap: i === 0 ? o.gap : false }));
  parseChatMarkdown(src).forEach((b, i) => {
    const gap = i > 0;
    if (b.type === "h") push(flat(b.c), { bold: true, gap });
    else if (b.type === "p") push(flat(b.c), { gap });
    else if (b.type === "quote") push(`» ${flat(b.c)}`, { indent: 1, gap });
    else if (b.type === "code") push(b.v, { indent: 1, gap });
    else
      b.items.forEach((it, j) =>
        push(`${b.type === "ul" ? "•" : `${j + 1}.`} ${flat(it)}`, {
          indent: 1,
          gap: gap && j === 0,
        }),
      );
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Versions du jour (écrites par le hook PocketBase `b201.pb.js`, miroir de `lib/b201.js`).

export type B201Version = { at: string; by: string; content: string };

/** Versions lues en base (champ JSON) : entrées valides seulement, plus récente d'abord. */
export function parseVersions(raw: unknown): B201Version[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (v): v is B201Version =>
        !!v &&
        typeof v === "object" &&
        typeof (v as B201Version).at === "string" &&
        typeof (v as B201Version).content === "string",
    )
    .map((v) => ({ at: v.at, by: typeof v.by === "string" ? v.by : "", content: v.content }))
    .sort((x, y) => y.at.localeCompare(x.at));
}

/** Nombre de caractères et de lignes (compteur sous l'éditeur). */
export function notesStats(src: string): { chars: number; words: number } {
  const t = src.trim();
  return { chars: src.length, words: t ? t.split(/\s+/).length : 0 };
}
