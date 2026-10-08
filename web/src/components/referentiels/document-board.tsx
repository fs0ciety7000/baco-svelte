"use client";

import { Download, Trash2, Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { deleteDocument, uploadDocument } from "@/app/(app)/referentiels/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/status-badge";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { safeCall } from "@/lib/orders/safe-call";
import { formatShortDay, dayOf } from "@/lib/orders/time";
import type { DocumentRow } from "@/server/data/referentiels";

export function DocumentBoard({
  documents,
  categories,
  canWrite,
  canManage,
}: {
  documents: DocumentRow[];
  categories: string[];
  canWrite: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<DocumentRow | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      {canWrite ? (
        <div>
          <Button variant="primary" onClick={() => setUploadOpen(true)} data-testid="document-new">
            <Upload aria-hidden /> Importer un document
          </Button>
        </div>
      ) : null}
      {documents.length === 0 ? (
        <EmptyState title="Aucun document" description="Aucun fichier pour ces filtres." />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <Th>Nom</Th>
                  <Th>Catégorie</Th>
                  <Th>Déposé le</Th>
                  <Th>Par</Th>
                  <Th>Actions</Th>
                </tr>
              </THead>
              <tbody data-testid="documents-table">
                {documents.map((d) => (
                  <Tr key={d.id}>
                    <Td className="font-medium">{d.name}</Td>
                    <Td>{d.category ? <Badge tone="info">{d.category}</Badge> : "—"}</Td>
                    <Td className="font-mono text-small tabular">
                      {formatShortDay(dayOf(d.created))}
                    </Td>
                    <Td className="text-fg-muted">{d.author || "—"}</Td>
                    <Td>
                      <div className="flex gap-1">
                        <Button asChild size="sm" variant="ghost" className="border border-border">
                          <a
                            href={`/api/referentiels/documents/${d.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Download aria-hidden className="size-4" /> Ouvrir
                          </a>
                        </Button>
                        {canManage ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="border border-border text-danger"
                            onClick={() => setConfirmDel(d)}
                            aria-label={`Supprimer ${d.name}`}
                          >
                            <Trash2 aria-hidden className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden" data-testid="documents-cards">
            {documents.map((d) => (
              <li key={d.id}>
                <a
                  href={`/api/referentiels/documents/${d.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <ListCard
                    title={d.name}
                    meta={`${d.category || "—"} · ${formatShortDay(dayOf(d.created))}`}
                    aside={<Download aria-hidden className="size-4 text-fg-muted" />}
                  />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent
          title="Importer un document"
          description="PDF, image ou document bureautique (max 30 Mo)."
        >
          <UploadForm
            categories={categories}
            onDone={() => {
              setUploadOpen(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <DialogContent
          title="Supprimer ce document ?"
          description="Refusé si une procédure le référence encore."
        >
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDel(null)}>
              Retour
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                start(async () => {
                  if (!confirmDel) return;
                  const res = await safeCall(deleteDocument(confirmDel.id));
                  if (!res.ok) return void toast.error(res.error);
                  toast.success("Document supprimé.");
                  setConfirmDel(null);
                  router.refresh();
                })
              }
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function UploadForm({ categories, onDone }: { categories: string[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const file = fileRef.current?.files?.[0];
        if (!file) return void toast.error("Sélectionnez un fichier.");
        const fd = new FormData();
        fd.set("name", name || file.name.replace(/\.[^.]+$/, ""));
        fd.set("category", category);
        fd.set("file", file);
        start(async () => {
          const res = await safeCall(uploadDocument(fd));
          if (!res.ok) return void toast.error(res.error);
          toast.success("Document importé.");
          onDone();
        });
      }}
    >
      <datalist id="doc-cat">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <Field label="Fichier" required>
        <input
          ref={fileRef}
          type="file"
          required
          className="block w-full text-small file:mr-3 file:min-h-11 file:rounded file:border file:border-border file:bg-surface-2 file:px-3 file:text-fg"
          onChange={(e) => {
            if (!name && e.target.files?.[0])
              setName(e.target.files[0].name.replace(/\.[^.]+$/, ""));
          }}
        />
      </Field>
      <Field label="Nom" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={300} />
      </Field>
      <Field label="Catégorie">
        <Input
          list="doc-cat"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          maxLength={60}
        />
      </Field>
      <DialogFooter>
        <Button type="submit" variant="primary" loading={pending} data-testid="document-save">
          <Upload aria-hidden /> Importer
        </Button>
      </DialogFooter>
    </form>
  );
}
