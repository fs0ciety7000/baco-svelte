import type { ReactNode } from "react";

// Rendu Markdown SÛR, sans injection HTML : on construit des éléments React (React échappe tout texte). Sous-ensemble
// volontairement limité (titres, listes, gras, liens http(s)) — aucune balise ni attribut arbitraire n'est produit.
// Remplace le `{@html renderMarkdown()}` de BACO : plus de dépendance DOMPurify, plus de surface XSS.

const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const BOLD = /\*\*([^*]+)\*\*/g;

/** Rendu inline : gras et liens http(s) seulement, le reste en texte brut (échappé par React). */
function inline(text: string, key: string): ReactNode[] {
  // On découpe d'abord sur les liens, puis sur le gras, en gardant des nœuds React (jamais de HTML).
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  text.replace(LINK, (m, label: string, url: string, offset: number) => {
    if (offset > last) out.push(...bold(text.slice(last, offset), `${key}-t${i++}`));
    out.push(
      <a
        key={`${key}-a${i++}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent underline-offset-2 hover:underline"
      >
        {label}
      </a>,
    );
    last = offset + m.length;
    return m;
  });
  if (last < text.length) out.push(...bold(text.slice(last), `${key}-t${i++}`));
  return out;
}

function bold(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  text.replace(BOLD, (m, inner: string, offset: number) => {
    if (offset > last) out.push(text.slice(last, offset));
    out.push(
      <strong key={`${key}-b${i++}`} className="font-semibold text-fg">
        {inner}
      </strong>,
    );
    last = offset + m.length;
    return m;
  });
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MarkdownView({ content, className }: { content: string; className?: string }) {
  const lines = String(content ?? "").split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`ul${blocks.length}`} className="list-inside list-disc text-body">
          {list}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((raw, n) => {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const level = (h[1] ?? "#").length;
      const cls = level === 1 ? "text-h3" : level === 2 ? "text-body-lg font-semibold" : "font-semibold";
      blocks.push(
        <p key={`h${n}`} className={`${cls} text-fg`}>
          {inline(h[2] ?? "", `h${n}`)}
        </p>,
      );
    } else if (/^[-*]\s+/.test(line)) {
      list.push(<li key={`li${n}`}>{inline(line.replace(/^[-*]\s+/, ""), `li${n}`)}</li>);
    } else if (line.trim() === "") {
      flush();
    } else {
      flush();
      blocks.push(
        <p key={`p${n}`} className="text-body">
          {inline(line, `p${n}`)}
        </p>,
      );
    }
  });
  flush();
  return <div className={`flex flex-col gap-2 ${className ?? ""}`}>{blocks}</div>;
}
