"use client";

import { Bold, Heading, Italic, Link2, List, ListOrdered } from "lucide-react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import { ChatMarkdown } from "@/components/ops/chat-markdown";
import { Segmented } from "@/components/ui/form-kit";
import { applyFormat, notesStats, type FormatKind } from "@/lib/ops/b201";
import { cn } from "@/lib/utils";

const TOOLS: { kind: FormatKind; label: string; icon: typeof Bold; keys?: string }[] = [
  { kind: "bold", label: "Gras", icon: Bold, keys: "Ctrl+B" },
  { kind: "italic", label: "Italique", icon: Italic, keys: "Ctrl+I" },
  { kind: "heading", label: "Titre", icon: Heading },
  { kind: "ul", label: "Liste à puces", icon: List },
  { kind: "ol", label: "Liste numérotée", icon: ListOrdered },
  { kind: "link", label: "Lien", icon: Link2 },
];

/**
 * Éditeur Markdown simple (B201, 15 oct. 2026) : barre d'outils (gras, italique, titre, listes, lien), raccourcis
 * Ctrl / ⌘ + B et I, aperçu rendu par le Markdown SÛR du Journal (`ChatMarkdown`, éléments React, aucun HTML).
 * Desktop (≥ 1024 px) : saisie et aperçu côte à côte ; plus étroit : onglets « Écrire » / « Aperçu ».
 */
export function MarkdownEditor({
  value,
  onChange,
  maxLength,
  label,
  placeholder,
  readOnly = false,
}: {
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  label: string;
  placeholder?: string;
  readOnly?: boolean;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const pendingSel = useRef<{ start: number; end: number } | null>(null);

  const format = (kind: FormatKind) => {
    const el = area.current;
    if (!el || readOnly) return;
    const next = applyFormat(value, el.selectionStart, el.selectionEnd, kind);
    if (next.value.length > maxLength) return;
    onChange(next.value);
    // Sélection posée juste après le rendu du nouveau texte (avant la frappe suivante).
    pendingSel.current = { start: next.start, end: next.end };
  };
  useLayoutEffect(() => {
    const el = area.current;
    const sel = pendingSel.current;
    if (!el || !sel) return;
    pendingSel.current = null;
    el.focus();
    el.setSelectionRange(sel.start, sel.end);
  }, [value]);
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const k = e.key.toLowerCase();
    if (k === "b" || k === "i") {
      e.preventDefault();
      format(k === "b" ? "bold" : "italic");
    }
  };

  if (readOnly)
    return value.trim() ? (
      <ChatMarkdown body={value} className="min-w-0" />
    ) : (
      <p className="text-body text-fg-muted">Aucune note pour ce jour.</p>
    );

  const stats = notesStats(value);
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="markdown-editor">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="toolbar"
          aria-label="Mise en forme"
          className="flex flex-wrap items-center gap-1 rounded-control border border-border bg-surface-2 p-1"
        >
          {TOOLS.map((t) => (
            <button
              key={t.kind}
              type="button"
              title={t.keys ? `${t.label} (${t.keys})` : t.label}
              aria-label={t.label}
              data-testid={`md-${t.kind}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (tab === "write") return format(t.kind);
                // Depuis l'aperçu (mobile) : retour à la saisie, puis mise en forme une fois le champ affiché.
                setTab("write");
                requestAnimationFrame(() => format(t.kind));
              }}
              className="grid size-9 cursor-pointer place-items-center rounded-control text-fg-muted hover:bg-surface hover:text-fg focus-visible:outline-1 focus-visible:outline-accent pointer-coarse:size-11"
            >
              <t.icon aria-hidden className="size-4" />
            </button>
          ))}
        </div>
        <Segmented
          label="Affichage des notes"
          className="lg:hidden"
          value={tab}
          onChange={setTab}
          options={[
            { value: "write", label: "Écrire" },
            { value: "preview", label: "Aperçu" },
          ]}
        />
      </div>
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <textarea
          ref={area}
          aria-label={label}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          spellCheck
          data-testid="b201-notes-input"
          className={cn(
            "min-h-56 w-full min-w-0 resize-y rounded-control border border-border bg-surface px-3 py-2 font-mono text-body leading-relaxed text-fg placeholder:text-fg-subtle focus-visible:border-accent focus-visible:outline-none lg:block",
            tab === "write" ? "block" : "hidden",
          )}
        />
        <div
          aria-label="Aperçu des notes"
          data-testid="b201-notes-preview"
          className={cn(
            "min-h-56 min-w-0 overflow-auto rounded-control border border-dashed border-border-strong px-3 py-2 lg:block",
            tab === "preview" ? "block" : "hidden",
          )}
        >
          {value.trim() ? (
            <ChatMarkdown body={value} />
          ) : (
            <p className="text-body text-fg-muted">L&apos;aperçu s&apos;affiche ici.</p>
          )}
        </div>
      </div>
      <p className="text-hint text-fg-muted">
        Markdown : **gras**, _italique_, « - » liste, « ### » titre, [texte](https://…). ·{" "}
        <span className="tabular">
          {stats.words} mots · {stats.chars} / {maxLength}
        </span>
      </p>
    </div>
  );
}
