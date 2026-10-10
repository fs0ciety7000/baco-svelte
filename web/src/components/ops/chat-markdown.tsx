import type { ReactNode } from "react";

import { parseChatMarkdown, safeHref, type Inline } from "@/lib/ops/chat-markdown";
import { cn } from "@/lib/utils";

// Rendu du Markdown du Journal en éléments React (React échappe tout texte ; aucun `dangerouslySetInnerHTML`).

/** Surligne les mots recherchés (insensible à la casse et aux accents) dans un texte brut. */
function mark(text: string, words: string[], key: string): ReactNode {
  if (!words.length || !text) return text;
  const fold = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const f = fold(text);
  // La forme repliée garde la longueur du texte d'origine pour les lettres latines usuelles (é → e).
  if (f.length !== text.length) return text;
  const hits: [number, number][] = [];
  for (const w of words) {
    const fw = fold(w);
    if (!fw) continue;
    for (let i = f.indexOf(fw); i !== -1; i = f.indexOf(fw, i + fw.length))
      hits.push([i, i + fw.length]);
  }
  if (!hits.length) return text;
  hits.sort((a, b) => a[0] - b[0]);
  const out: ReactNode[] = [];
  let last = 0;
  hits.forEach(([a, b], j) => {
    if (a < last) return;
    if (a > last) out.push(text.slice(last, a));
    out.push(
      <mark
        key={`${key}.m${j}`}
        className="bg-[color-mix(in_oklab,var(--warn)_30%,transparent)] text-fg"
      >
        {text.slice(a, b)}
      </mark>,
    );
    last = b;
  });
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function inline(nodes: Inline[], key: string, HL: string[] = []): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}.${i}`;
    switch (n.t) {
      case "text":
        return HL.length ? <span key={k}>{mark(n.v, HL, k)}</span> : n.v;
      case "br":
        return <br key={k} />;
      case "b":
        return (
          <strong key={k} className="font-semibold text-fg">
            {inline(n.c, k, HL)}
          </strong>
        );
      case "i":
        return <em key={k}>{inline(n.c, k, HL)}</em>;
      case "s":
        return (
          <s key={k} className="text-fg-muted">
            {inline(n.c, k, HL)}
          </s>
        );
      case "code":
        return (
          <code key={k} className="border border-border bg-surface-2 px-1 font-mono text-[0.92em]">
            {n.v}
          </code>
        );
      case "mention":
        return (
          <span key={k} className="font-medium text-info">
            {n.v}
          </span>
        );
      case "link":
      case "url": {
        const href = safeHref(n.t === "link" ? n.url : n.v);
        const label = n.t === "link" ? n.label : n.v;
        return href ? (
          <a
            key={k}
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="break-all link"
          >
            {label}
          </a>
        ) : (
          label
        );
      }
    }
  });
}

/** Message du Journal : Markdown sûr (gras, italique, barré, code, liens, mentions, listes, citations). */
export function ChatMarkdown({
  body,
  className,
  highlight = [],
}: {
  body: string;
  className?: string;
  /** Mots de la recherche à surligner. */
  highlight?: string[];
}) {
  const blocks = parseChatMarkdown(body);
  // Rendu synchrone : la liste des mots est posée pour ce rendu seulement.
  const HL = highlight.filter((w) => w.length >= 2).slice(0, 6);
  return (
    <div className={cn("flex flex-col gap-1.5 text-body break-words text-fg", className)}>
      {blocks.map((b, i) => {
        const k = `b${i}`;
        if (b.type === "h")
          return (
            <p key={k} className="text-body-lg font-semibold">
              {inline(b.c, k, HL)}
            </p>
          );
        if (b.type === "ul" || b.type === "ol") {
          const List = b.type === "ul" ? "ul" : "ol";
          return (
            <List
              key={k}
              className={cn(
                "flex flex-col gap-0.5 pl-5",
                b.type === "ul" ? "list-disc" : "list-decimal",
              )}
            >
              {b.items.map((it, j) => (
                <li key={j}>{inline(it, `${k}.${j}`, HL)}</li>
              ))}
            </List>
          );
        }
        if (b.type === "quote")
          return (
            <blockquote key={k} className="border-l-2 border-border-strong pl-3 text-fg-muted">
              {inline(b.c, k, HL)}
            </blockquote>
          );
        if (b.type === "code")
          return (
            <pre
              key={k}
              className="overflow-x-auto border border-border bg-surface-2 p-2 font-mono text-small whitespace-pre"
            >
              {b.v}
            </pre>
          );
        return <p key={k}>{inline(b.c, k, HL)}</p>;
      })}
    </div>
  );
}
