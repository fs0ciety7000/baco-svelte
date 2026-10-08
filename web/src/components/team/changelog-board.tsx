"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteChangelog, saveChangelog } from "@/app/(app)/equipe/actions";
import { MarkdownView } from "@/components/referentiels/markdown-view";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import type { ChangelogEntry, ChangelogType } from "@/server/data/team";

const TYPES: Record<ChangelogType, { label: string; tone: "ok" | "info" | "warn" }> = {
  nouveau: { label: "Nouveau", tone: "ok" },
  ameliore: { label: "Amélioré", tone: "info" },
  corrige: { label: "Corrigé", tone: "warn" },
};

const dateFmt = new Intl.DateTimeFormat("fr-BE", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Brussels",
});

type Draft = { id: string | null; title: string; type: ChangelogType; content: string };

/** Nouveautés de CSM : fil chronologique, Markdown sûr ; publication par admin, sysop et coordinateurs. */
export function ChangelogBoard({ items, canEdit }: { items: ChangelogEntry[]; canEdit: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    draft &&
    start(async () => {
      const r = await saveChangelog(draft.id, draft);
      if (!r.ok) return void toast.error(r.error);
      toast.success(draft.id ? "Nouveauté modifiée." : "Nouveauté publiée.");
      setDraft(null);
      router.refresh();
    });
  const remove = (id: string) =>
    start(async () => {
      if (!window.confirm("Supprimer cette nouveauté ?")) return;
      const r = await deleteChangelog(id);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Nouveauté supprimée.");
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <div>
          <Button onClick={() => setDraft({ id: null, title: "", type: "nouveau", content: "" })}>
            <Plus aria-hidden /> Publier une nouveauté
          </Button>
        </div>
      ) : null}
      {items.length === 0 ? (
        <EmptyState
          title="Pas encore de nouveautés"
          description="Les évolutions de CSM apparaîtront ici."
        />
      ) : (
        <ol
          className="relative flex flex-col gap-4 border-l border-border pl-5"
          data-testid="changelog"
        >
          {items.map((c) => (
            <li key={c.id} className="relative">
              <span
                aria-hidden
                className="absolute top-2 -left-[25px] size-2.5 border border-border-strong bg-accent"
              />
              <article className="flex flex-col gap-2 border border-border bg-surface p-4">
                <header className="flex flex-wrap items-center gap-2">
                  <Badge tone={TYPES[c.type].tone}>{TYPES[c.type].label}</Badge>
                  <h3 className="text-body-lg font-semibold">{c.title}</h3>
                  <span className="ml-auto text-small text-fg-muted">
                    {dateFmt.format(new Date(c.created.replace(" ", "T")))}
                    {c.author ? ` · ${c.author}` : ""}
                  </span>
                </header>
                {c.content ? <MarkdownView content={c.content} /> : null}
                {canEdit ? (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setDraft({ id: c.id, title: c.title, type: c.type, content: c.content })
                      }
                    >
                      <Pencil aria-hidden /> Modifier
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(c.id)}
                      disabled={pending}
                    >
                      <Trash2 aria-hidden /> Supprimer
                    </Button>
                  </div>
                ) : null}
              </article>
            </li>
          ))}
        </ol>
      )}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent
          eyebrow="// Nouveautés"
          title={draft?.id ? "Modifier la nouveauté" : "Publier une nouveauté"}
          description="Texte en Markdown simple (titres, listes, gras, liens)."
        >
          {draft ? (
            <div className="flex flex-col gap-3">
              <Field label="Titre" required>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  maxLength={200}
                />
              </Field>
              <Field label="Type">
                <Select
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value as ChangelogType })}
                >
                  {Object.entries(TYPES).map(([k, t]) => (
                    <option key={k} value={k}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Contenu">
                <Textarea
                  rows={8}
                  value={draft.content}
                  onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                  maxLength={20000}
                />
              </Field>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Annuler
            </Button>
            <Button onClick={save} loading={pending} disabled={!draft?.title.trim()}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
