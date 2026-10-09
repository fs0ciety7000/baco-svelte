import type { ReactNode } from "react";

import { parseChatMarkdown, safeHref, type Inline } from "@/lib/ops/chat-markdown";
import { cn } from "@/lib/utils";

// Rendu du Markdown du Journal en éléments React (React échappe tout texte ; aucun `dangerouslySetInnerHTML`).

function inline(nodes: Inline[], key: string): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}.${i}`;
    switch (n.t) {
      case "text":
        return n.v;
      case "br":
        return <br key={k} />;
      case "b":
        return (
          <strong key={k} className="font-semibold text-fg">
            {inline(n.c, k)}
          </strong>
        );
      case "i":
        return <em key={k}>{inline(n.c, k)}</em>;
      case "s":
        return (
          <s key={k} className="text-fg-muted">
            {inline(n.c, k)}
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
export function ChatMarkdown({ body, className }: { body: string; className?: string }) {
  const blocks = parseChatMarkdown(body);
  return (
    <div className={cn("flex flex-col gap-1.5 text-body break-words text-fg", className)}>
      {blocks.map((b, i) => {
        const k = `b${i}`;
        if (b.type === "h")
          return (
            <p key={k} className="text-body-lg font-semibold">
              {inline(b.c, k)}
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
                <li key={j}>{inline(it, `${k}.${j}`)}</li>
              ))}
            </List>
          );
        }
        if (b.type === "quote")
          return (
            <blockquote key={k} className="border-l-2 border-border-strong pl-3 text-fg-muted">
              {inline(b.c, k)}
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
        return <p key={k}>{inline(b.c, k)}</p>;
      })}
    </div>
  );
}
