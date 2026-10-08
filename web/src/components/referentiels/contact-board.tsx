"use client";

import { Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  deleteContact,
  findContactDuplicates,
  loadContact,
  saveContact,
} from "@/app/(app)/referentiels/actions";
import { PhoneLink } from "@/components/pmr/phone-link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/status-badge";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { safeCall } from "@/lib/orders/safe-call";
import type { ContactInput } from "@/lib/referentiels/model";
import type { Contact } from "@/server/data/referentiels";

export type Facets = { categories: string[]; zones: string[]; groups: string[] };

const toInput = (c?: Contact | null): ContactInput => ({
  name: c?.name ?? "",
  phone: c?.phone ?? "",
  email: c?.email ?? "",
  category: c?.category ?? "",
  zone: c?.zone ?? "",
  group: c?.group ?? "",
  note: c?.note ?? "",
});

/** Annuaire général (lecture par tous, écriture coordinateurs) : liste groupée, fiche en panneau, création avec
 *  détection de doublon. */
export function ContactBoard({
  rows,
  facets,
  canWrite,
}: {
  rows: Contact[];
  facets: Facets;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Contact | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const wanted = useRef<string | null>(null);

  const load = useCallback(async (id: string) => {
    wanted.current = id;
    const res = await safeCall(loadContact(id));
    if (wanted.current !== id) return;
    if (res.ok) setDetail(res.data);
    else toast.error(res.error);
  }, []);
  useEffect(() => {
    if (openId) void load(openId);
  }, [openId, load]);

  // Regroupement par « groupe » (repliable via <details> natif).
  const groups = [...new Set(rows.map((r) => r.group || "Sans groupe"))];

  return (
    <>
      {canWrite ? (
        <div>
          <Button variant="primary" onClick={() => setCreateOpen(true)} data-testid="contact-new">
            <Plus aria-hidden /> Nouveau contact
          </Button>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title="Aucun contact" description="Aucun contact pour ces filtres." />
      ) : (
        groups.map((g) => {
          const list = rows.filter((r) => (r.group || "Sans groupe") === g);
          return (
            <details key={g} open className="flex flex-col gap-2">
              <summary className="label-mono cursor-pointer text-fg-muted">
                {g} · {list.length}
              </summary>
              <div className="mt-2 hidden md:block">
                <Table>
                  <THead>
                    <tr>
                      <Th>Nom</Th>
                      <Th>Catégorie</Th>
                      <Th>Zone</Th>
                      <Th>Téléphone</Th>
                      <Th>E-mail</Th>
                    </tr>
                  </THead>
                  <tbody data-testid="contacts-table">
                    {list.map((c) => (
                      <Tr key={c.id} className="cursor-pointer" onClick={() => setOpenId(c.id)}>
                        <Td className="font-medium">
                          <button
                            type="button"
                            className="cursor-pointer text-left focus-visible:outline-1 focus-visible:outline-accent"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenId(c.id);
                            }}
                          >
                            {c.name}
                          </button>
                        </Td>
                        <Td>{c.category ? <Badge tone="info">{c.category}</Badge> : "—"}</Td>
                        <Td className="text-fg-muted">{c.zone || "—"}</Td>
                        <Td className="font-mono tabular" onClick={(e) => e.stopPropagation()}>
                          {c.phone ? <PhoneLink phone={c.phone} /> : "—"}
                        </Td>
                        <Td className="max-w-56 truncate text-fg-muted" onClick={(e) => e.stopPropagation()}>
                          {c.email ? (
                            <a className="hover:underline" href={`mailto:${c.email}`}>
                              {c.email}
                            </a>
                          ) : (
                            "—"
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
              <ul className="mt-2 flex flex-col gap-2 md:hidden" data-testid="contacts-cards">
                {list.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="block w-full cursor-pointer text-left"
                      onClick={() => setOpenId(c.id)}
                    >
                      <ListCard
                        title={c.name}
                        meta={`${c.category || "—"}${c.zone ? ` · ${c.zone}` : ""}${c.phone ? ` · ${c.phone}` : ""}`}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          );
        })
      )}

      <Sheet
        open={!!openId}
        onOpenChange={(o) => {
          if (!o) {
            setOpenId(null);
            setDetail(null);
            wanted.current = null;
          }
        }}
        eyebrow="// Annuaire"
        title={detail?.name ?? "Contact"}
        description={detail ? [detail.category, detail.zone].filter(Boolean).join(" · ") : undefined}
      >
        {!detail ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-5" data-testid="contact-panel">
            {detail.phone ? <PhoneLink phone={detail.phone} /> : null}
            {detail.email ? (
              <a className="text-accent hover:underline" href={`mailto:${detail.email}`}>
                {detail.email}
              </a>
            ) : null}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
              <dt className="text-small text-fg-muted">Catégorie</dt>
              <dd>{detail.category || "—"}</dd>
              <dt className="text-small text-fg-muted">Groupe</dt>
              <dd>{detail.group || "—"}</dd>
              <dt className="text-small text-fg-muted">Zone</dt>
              <dd>{detail.zone || "—"}</dd>
              {detail.note ? (
                <>
                  <dt className="text-small text-fg-muted">Remarque</dt>
                  <dd className="whitespace-pre-line">{detail.note}</dd>
                </>
              ) : null}
            </dl>
            {canWrite ? (
              <ContactActions
                contact={detail}
                facets={facets}
                onSaved={() => {
                  void load(detail.id);
                  router.refresh();
                }}
                onDeleted={() => {
                  setOpenId(null);
                  setDetail(null);
                  router.refresh();
                }}
              />
            ) : null}
          </div>
        )}
      </Sheet>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          title="Nouveau contact"
          description="Les contacts proches sont signalés avant d'enregistrer."
        >
          <ContactForm
            id={null}
            initial={toInput(null)}
            facets={facets}
            onOpen={(id) => {
              setCreateOpen(false);
              setOpenId(id);
            }}
            onSaved={(id) => {
              setCreateOpen(false);
              setOpenId(id);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ContactActions({
  contact,
  facets,
  onSaved,
  onDeleted,
}: {
  contact: Contact;
  facets: Facets;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
        <Pencil aria-hidden className="size-4" /> Modifier
      </Button>
      <Button size="sm" variant="danger" onClick={() => setConfirmDel(true)}>
        <Trash2 aria-hidden className="size-4" /> Supprimer
      </Button>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent title="Modifier le contact">
          <ContactForm
            id={contact.id}
            initial={toInput(contact)}
            facets={facets}
            onSaved={() => {
              setEditOpen(false);
              onSaved();
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={confirmDel} onOpenChange={setConfirmDel}>
        <DialogContent title="Supprimer ce contact ?" description="Action définitive.">
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDel(false)}>
              Retour
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const res = await safeCall(deleteContact(contact.id));
                  if (!res.ok) return void toast.error(res.error);
                  toast.success("Contact supprimé.");
                  onDeleted();
                })
              }
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContactForm({
  id,
  initial,
  facets,
  onSaved,
  onOpen,
}: {
  id: string | null;
  initial: ContactInput;
  facets: Facets;
  onSaved: (id: string) => void;
  onOpen?: (id: string) => void;
}) {
  const [f, setF] = useState(initial);
  const [dupes, setDupes] = useState<{ id: string; name: string }[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      if (!id && !confirmed) {
        const d = await safeCall(findContactDuplicates(f.name, f.phone));
        if (d.ok && d.data.length) {
          setDupes(d.data.map((c) => ({ id: c.id, name: c.name })));
          setConfirmed(true);
          return;
        }
      }
      const res = await safeCall(saveContact(id, f));
      if (!res.ok) return void toast.error(res.error);
      toast.success("Contact enregistré.");
      onSaved(res.data.id);
    });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <datalist id="dc-cat">
        {facets.categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="dc-zone">
        {facets.zones.map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>
      <datalist id="dc-group">
        {facets.groups.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <Field label="Nom" required>
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={200} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Téléphone">
          <Input
            type="tel"
            inputMode="tel"
            value={f.phone}
            onChange={(e) => setF({ ...f, phone: e.target.value })}
            maxLength={60}
          />
        </Field>
        <Field label="E-mail">
          <Input
            type="email"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
            maxLength={200}
          />
        </Field>
        <Field label="Catégorie" required>
          <Input
            list="dc-cat"
            value={f.category}
            onChange={(e) => setF({ ...f, category: e.target.value })}
            required
            maxLength={60}
          />
        </Field>
        <Field label="Zone">
          <Input
            list="dc-zone"
            value={f.zone}
            onChange={(e) => setF({ ...f, zone: e.target.value })}
            maxLength={60}
          />
        </Field>
      </div>
      <Field label="Groupe">
        <Input
          list="dc-group"
          value={f.group}
          onChange={(e) => setF({ ...f, group: e.target.value })}
          maxLength={120}
        />
      </Field>
      <Field label="Remarque">
        <Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={1000} />
      </Field>
      {dupes.length ? (
        <div role="alert" className="flex flex-col gap-1 border border-warn/60 p-3 text-small">
          <p className="font-medium text-fg">Contacts proches déjà existants :</p>
          <ul className="list-inside list-disc">
            {dupes.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  className="min-h-11 cursor-pointer text-accent underline-offset-2 hover:underline md:min-h-0"
                  onClick={() => onOpen?.(d.id)}
                >
                  {d.name}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-fg-muted">Enregistrer à nouveau pour créer quand même un nouveau contact.</p>
        </div>
      ) : null}
      <DialogFooter className={id ? "mx-0 mb-0 border-0 px-0" : undefined}>
        <Button type="submit" variant="primary" loading={pending} data-testid="contact-save">
          <Save aria-hidden /> {id ? "Enregistrer" : dupes.length ? "Créer quand même" : "Créer le contact"}
        </Button>
      </DialogFooter>
    </form>
  );
}
