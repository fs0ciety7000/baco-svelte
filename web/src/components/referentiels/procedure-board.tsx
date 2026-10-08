"use client";

import { FileText, History, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  deleteProcedure,
  loadProcedure,
  restoreProcedureVersion,
  saveProcedure,
} from "@/app/(app)/referentiels/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/status-badge";
import { ListCard } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { safeCall } from "@/lib/orders/safe-call";
import { pbDate } from "@/lib/orders/time";
import type { ProcedureInput } from "@/lib/referentiels/model";
import type { Procedure, ProcedureVersion } from "@/server/data/referentiels";

import { MarkdownView } from "./markdown-view";

type Loaded = { procedure: Procedure; versions: ProcedureVersion[] };
type DocOption = { id: string; name: string };

const at = new Intl.DateTimeFormat("fr-BE", {
  timeZone: "Europe/Brussels",
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const excerpt = (s: string) => {
  const t = s
    .replace(/[#*>`-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > 160 ? `${t.slice(0, 160)}…` : t;
};
const toInput = (p?: Procedure | null): ProcedureInput => ({
  title: p?.title ?? "",
  category: p?.category ?? "",
  content: p?.content ?? "",
  attachments: p?.attachments.map((a) => a.id) ?? [],
});

export function ProcedureBoard({
  procedures,
  categories,
  documents,
  canWrite,
  canManage,
}: {
  procedures: Procedure[];
  categories: string[];
  documents: DocOption[];
  canWrite: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [data, setData] = useState<Loaded | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pending, start] = useTransition();
  const wanted = useRef<string | null>(null);

  const load = useCallback(async (id: string) => {
    wanted.current = id;
    const res = await safeCall(loadProcedure(id));
    if (wanted.current !== id) return;
    if (res.ok) setData(res.data);
    else toast.error(res.error);
  }, []);
  useEffect(() => {
    if (openId) void load(openId);
  }, [openId, load]);

  return (
    <>
      {canWrite ? (
        <div>
          <Button variant="primary" onClick={() => setCreateOpen(true)} data-testid="procedure-new">
            <Plus aria-hidden /> Nouvelle procédure
          </Button>
        </div>
      ) : null}
      {procedures.length === 0 ? (
        <EmptyState title="Aucune procédure" description="Aucune procédure pour ces filtres." />
      ) : (
        <ul className="grid gap-2 md:grid-cols-2" data-testid="procedures-grid">
          {procedures.map((p) => (
            <li key={p.id} className="min-w-0">
              <button
                type="button"
                className="block w-full cursor-pointer text-left"
                onClick={() => setOpenId(p.id)}
              >
                <ListCard
                  title={p.title}
                  meta={excerpt(p.content)}
                  aside={p.category ? <Badge tone="info">{p.category}</Badge> : null}
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={!!openId}
        onOpenChange={(o) => {
          if (!o) {
            setOpenId(null);
            setData(null);
            wanted.current = null;
          }
        }}
        eyebrow="// Procédure"
        title={data?.procedure.title ?? "Procédure"}
        description={data?.procedure.category || undefined}
        footer={
          data && canWrite ? (
            <div className="flex w-full flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
                <Pencil aria-hidden className="size-4" /> Modifier
              </Button>
              {canManage ? (
                <Button
                  size="sm"
                  variant="danger"
                  loading={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await safeCall(deleteProcedure(data.procedure.id));
                      if (!res.ok) return void toast.error(res.error);
                      toast.success("Procédure supprimée.");
                      setOpenId(null);
                      setData(null);
                      router.refresh();
                    })
                  }
                >
                  <Trash2 aria-hidden className="size-4" /> Supprimer
                </Button>
              ) : null}
            </div>
          ) : null
        }
      >
        {!data ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-5" data-testid="procedure-panel">
            <MarkdownView content={data.procedure.content} />
            {data.procedure.attachments.length ? (
              <section className="flex flex-col gap-2" aria-label="Pièces jointes">
                <h3 className="label-mono text-fg-muted">Pièces jointes</h3>
                <ul className="flex flex-col gap-1.5">
                  {data.procedure.attachments.map((a) => (
                    <li key={a.id}>
                      <a
                        href={`/api/referentiels/documents/${a.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-11 items-center gap-2 border border-border px-2 py-1 hover:bg-surface-2 md:min-h-0"
                      >
                        <FileText aria-hidden className="size-4 text-fg-muted" />
                        <span className="min-w-0 flex-1 truncate">{a.name}</span>
                        {a.category ? (
                          <span className="text-small text-fg-muted">{a.category}</span>
                        ) : null}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <section className="flex flex-col gap-2" aria-label="Historique">
              <h3 className="label-mono text-fg-muted">
                <History aria-hidden className="mr-1 inline size-4" /> Historique (
                {data.versions.length})
              </h3>
              {data.versions.length === 0 ? (
                <p className="text-small text-fg-muted">Aucune version antérieure.</p>
              ) : null}
              <ul className="flex flex-col gap-1.5">
                {data.versions.map((v) => {
                  const d = pbDate(v.at);
                  return (
                    <li
                      key={v.id}
                      className="flex items-center gap-2 border border-border px-2 py-1 text-small"
                    >
                      <span className="font-mono text-fg-muted tabular">
                        {d ? at.format(d) : ""}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{v.by || "Import BACO"}</span>
                      {canManage ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="border border-border"
                          disabled={pending}
                          onClick={() =>
                            start(async () => {
                              const res = await safeCall(
                                restoreProcedureVersion(data.procedure.id, v.id),
                              );
                              if (!res.ok) return void toast.error(res.error);
                              toast.success("Version restaurée (nouvelle modification).");
                              void load(data.procedure.id);
                              router.refresh();
                            })
                          }
                        >
                          Restaurer
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        )}
      </Sheet>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent title="Nouvelle procédure">
          <ProcedureForm
            id={null}
            initial={toInput(null)}
            categories={categories}
            documents={documents}
            onSaved={(id) => {
              setCreateOpen(false);
              setOpenId(id);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      {data ? (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent title="Modifier la procédure">
            <ProcedureForm
              id={data.procedure.id}
              initial={toInput(data.procedure)}
              categories={categories}
              documents={documents}
              onSaved={() => {
                setEditOpen(false);
                void load(data.procedure.id);
                router.refresh();
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

function ProcedureForm({
  id,
  initial,
  categories,
  documents,
  onSaved,
}: {
  id: string | null;
  initial: ProcedureInput;
  categories: string[];
  documents: DocOption[];
  onSaved: (id: string) => void;
}) {
  const [f, setF] = useState(initial);
  const [pending, start] = useTransition();
  const toggle = (docId: string) =>
    setF((s) => ({
      ...s,
      attachments: s.attachments.includes(docId)
        ? s.attachments.filter((x) => x !== docId)
        : [...s.attachments, docId],
    }));
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await safeCall(saveProcedure(id, f));
          if (!res.ok) return void toast.error(res.error);
          toast.success("Procédure enregistrée.");
          onSaved(res.data.id);
        });
      }}
    >
      <datalist id="proc-cat">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <Field label="Titre" required>
        <Input
          value={f.title}
          onChange={(e) => setF({ ...f, title: e.target.value })}
          required
          maxLength={300}
        />
      </Field>
      <Field label="Catégorie">
        <Input
          list="proc-cat"
          value={f.category}
          onChange={(e) => setF({ ...f, category: e.target.value })}
          maxLength={60}
        />
      </Field>
      <Field
        label="Contenu (Markdown)"
        hint="Titres #, listes -, **gras**, liens [texte](https://…)."
      >
        <Textarea
          value={f.content}
          onChange={(e) => setF({ ...f, content: e.target.value })}
          maxLength={20000}
          rows={10}
          className="font-mono text-small"
        />
      </Field>
      {documents.length ? (
        <Field label="Documents liés">
          <div className="flex max-h-40 flex-col gap-1 overflow-auto border border-border p-2">
            {documents.map((d) => (
              <label key={d.id} className="flex min-h-11 items-center gap-2 md:min-h-0">
                <input
                  type="checkbox"
                  checked={f.attachments.includes(d.id)}
                  onChange={() => toggle(d.id)}
                />
                <span className="min-w-0 flex-1 truncate text-small">{d.name}</span>
              </label>
            ))}
          </div>
        </Field>
      ) : null}
      <DialogFooter className={id ? "mx-0 mb-0 border-0 px-0" : undefined}>
        <Button type="submit" variant="primary" loading={pending} data-testid="procedure-save">
          <Save aria-hidden /> {id ? "Enregistrer" : "Créer la procédure"}
        </Button>
      </DialogFooter>
    </form>
  );
}
