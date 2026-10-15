"use client";

import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import {
  deleteBusChild,
  deleteSupplier,
  loadBusSupplier,
  loadTaxiSupplier,
  saveBusChild,
  saveBusCompany,
  saveTaxiCompany,
  setBusCompanyLines,
  type BusChildKind,
  type BusCompanyInput,
  type TaxiCompanyInput,
} from "@/app/(app)/commandes/fournisseurs/actions";
import { PhoneLink } from "@/components/pmr/phone-link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { MultiSelect } from "@/components/ui/multi-select";
import { Sheet } from "@/components/ui/sheet";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { companyLineChoices, diffCompanyLines, type LineOption } from "@/lib/orders/company-lines";
import { safeCall } from "@/lib/orders/safe-call";
import { pl } from "@/lib/utils";
import type {
  BusSupplier,
  Person,
  SupplierKind,
  SupplierRow,
  TaxiSupplier,
} from "@/server/data/suppliers";

type Rights = { canWrite: boolean; canUpdate: boolean; canDelete: boolean };

/** Fournisseurs (bus ou taxi) : liste, fiche en panneau, création / modification en dialogue, suppression. */
export function SupplierBoard({
  kind,
  rows,
  canWrite,
  canUpdate,
  canDelete,
  lineOptions = [],
  status,
}: {
  kind: SupplierKind;
  rows: SupplierRow[];
  /** Ligne d'état (nombre de sociétés) à gauche du bouton « Nouvelle société ». */
  status?: ReactNode;
  /** Lignes du référentiel (`rail_lines`) pour les lignes desservies d'une société de bus. */
  lineOptions?: LineOption[];
} & Rights) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [bus, setBus] = useState<BusSupplier | null>(null);
  const [taxi, setTaxi] = useState<TaxiSupplier | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const wanted = useRef<string | null>(null);

  const load = useCallback(
    async (id: string) => {
      wanted.current = id;
      if (kind === "bus") {
        const res = await safeCall(loadBusSupplier(id));
        if (wanted.current !== id) return;
        if (res.ok) setBus(res.data);
        else toast.error(res.error);
      } else {
        const res = await safeCall(loadTaxiSupplier(id));
        if (wanted.current !== id) return;
        if (res.ok) setTaxi(res.data);
        else toast.error(res.error);
      }
    },
    [kind],
  );
  useEffect(() => {
    if (openId) void load(openId);
  }, [openId, load]);

  const close = () => {
    setOpenId(null);
    setBus(null);
    setTaxi(null);
    wanted.current = null;
  };
  const detail = kind === "bus" ? bus : taxi;
  const rights = { canWrite, canUpdate, canDelete };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {status}
        {canWrite ? (
          <Button variant="primary" onClick={() => setCreateOpen(true)} data-testid="supplier-new">
            <Plus aria-hidden /> Nouvelle société
          </Button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          framed
          title="Aucune société"
          description="Aucun fournisseur pour cette recherche."
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <Th>Société</Th>
                  <Th>Téléphone</Th>
                  <Th>E-mail</Th>
                  <Th>{kind === "bus" ? "Adresse" : "Lieux"}</Th>
                </tr>
              </THead>
              <tbody data-testid="suppliers-table">
                {rows.map((r) => (
                  <Tr
                    key={r.id}
                    className="cursor-pointer"
                    selected={r.id === openId}
                    onClick={() => setOpenId(r.id)}
                  >
                    <Td className="font-medium">
                      <button
                        type="button"
                        className="cursor-pointer text-left focus-visible:outline-1 focus-visible:outline-accent"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenId(r.id);
                        }}
                      >
                        {r.name}
                      </button>
                    </Td>
                    <Td className="font-mono tabular" onClick={(e) => e.stopPropagation()}>
                      {r.phones[0] ? <PhoneLink phone={r.phones[0]} /> : "—"}
                    </Td>
                    <Td className="max-w-64 truncate text-fg-muted">
                      {r.emails.join(", ") || "—"}
                    </Td>
                    <Td className="max-w-72 truncate text-fg-muted">{r.where || "—"}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden" data-testid="suppliers-cards">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="block w-full cursor-pointer text-left"
                  onClick={() => setOpenId(r.id)}
                >
                  <ListCard
                    title={r.name}
                    meta={[r.phones[0], r.emails[0], r.where].filter(Boolean).join(" · ") || "—"}
                  />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Sheet
        open={!!openId}
        onOpenChange={(o) => {
          if (!o) close();
        }}
        eyebrow={kind === "bus" ? "Société de bus" : "Société de taxi"}
        title={detail?.name ?? "Fournisseur"}
        description={
          detail
            ? detail.orders
              ? `${detail.orders} ${pl(detail.orders, "bon")} de commande`
              : "Aucun bon de commande"
            : undefined
        }
      >
        {!detail || detail.id !== openId ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : kind === "bus" && bus ? (
          <BusPanel
            s={bus}
            rights={rights}
            lineOptions={lineOptions}
            onChanged={() => {
              void load(bus.id);
              router.refresh();
            }}
            onDeleted={() => {
              close();
              router.refresh();
            }}
          />
        ) : taxi ? (
          <TaxiPanel
            s={taxi}
            rights={rights}
            onChanged={() => {
              void load(taxi.id);
              router.refresh();
            }}
            onDeleted={() => {
              close();
              router.refresh();
            }}
          />
        ) : null}
      </Sheet>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          title={kind === "bus" ? "Nouvelle société de bus" : "Nouvelle société de taxi"}
        >
          {kind === "bus" ? (
            <BusForm
              id={null}
              initial={{ name: "", email: "", phone: "", address: "", notes: "" }}
              onSaved={(id) => {
                setCreateOpen(false);
                setOpenId(id);
                router.refresh();
              }}
            />
          ) : (
            <TaxiForm
              id={null}
              initial={{ name: "", emails: "", phones: "", addresses: "", places: "", notes: "" }}
              onSaved={(id) => {
                setCreateOpen(false);
                setOpenId(id);
                router.refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------
// Fiches

function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-small text-fg-muted">{label}</dt>
          <dd className="min-w-0 break-words whitespace-pre-line">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

const mails = (list: string[]) =>
  list.length
    ? list.map((m) => (
        <a key={m} className="link mr-2 inline-block" href={`mailto:${m}`}>
          {m}
        </a>
      ))
    : "—";

function BusPanel({
  s,
  rights,
  lineOptions,
  onChanged,
  onDeleted,
}: {
  s: BusSupplier;
  rights: Rights;
  lineOptions: LineOption[];
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const emails = s.email.split(/[;,\s]+/).filter(Boolean);
  return (
    <div className="flex flex-col gap-5" data-testid="supplier-panel">
      <Facts
        items={[
          ["E-mail", mails(emails)],
          ["Téléphone", s.phone ? <PhoneLink phone={s.phone} /> : "—"],
          ["Adresse", s.address],
          ["Remarques", s.notes],
        ]}
      />
      <CompanyActions
        kind="bus"
        id={s.id}
        orders={s.orders}
        rights={rights}
        onDeleted={onDeleted}
        edit={(done) => (
          <BusForm
            id={s.id}
            initial={{
              name: s.name,
              email: s.email,
              phone: s.phone,
              address: s.address,
              notes: s.notes,
            }}
            onSaved={() => {
              done();
              onChanged();
            }}
          />
        )}
      />
      <ChildSection
        title="Chauffeurs"
        kind="driver"
        company={s.id}
        items={s.drivers}
        rights={rights}
        onChanged={onChanged}
      />
      <ChildSection
        title="Contacts"
        kind="contact"
        company={s.id}
        items={s.contacts}
        rights={rights}
        onChanged={onChanged}
      />
      <CompanyLines
        company={s.id}
        stored={s.lines}
        referential={lineOptions}
        rights={rights}
        onChanged={onChanged}
      />
    </div>
  );
}

function TaxiPanel({
  s,
  rights,
  onChanged,
  onDeleted,
}: {
  s: TaxiSupplier;
  rights: Rights;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  return (
    <div className="flex flex-col gap-5" data-testid="supplier-panel">
      <Facts
        items={[
          ["E-mail", mails(s.emails)],
          [
            "Téléphone",
            s.phones.length ? (
              <span className="flex flex-col gap-1">
                {s.phones.map((p) => (
                  <PhoneLink key={p} phone={p} />
                ))}
              </span>
            ) : (
              "—"
            ),
          ],
          ["Adresses", s.addresses.join("\n")],
          ["Lieux desservis", s.places.join(", ")],
          ["Remarques", s.notes.join("\n")],
        ]}
      />
      <CompanyActions
        kind="taxi"
        id={s.id}
        orders={s.orders}
        rights={rights}
        onDeleted={onDeleted}
        edit={(done) => (
          <TaxiForm
            id={s.id}
            initial={{
              name: s.name,
              emails: s.emails.join("\n"),
              phones: s.phones.join("\n"),
              addresses: s.addresses.join("\n"),
              places: s.places.join("\n"),
              notes: s.notes.join("\n"),
            }}
            onSaved={() => {
              done();
              onChanged();
            }}
          />
        )}
      />
    </div>
  );
}

function CompanyActions({
  kind,
  id,
  orders,
  rights,
  edit,
  onDeleted,
}: {
  kind: SupplierKind;
  id: string;
  orders: number;
  rights: Rights;
  edit: (done: () => void) => React.ReactNode;
  onDeleted: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [pending, start] = useTransition();
  if (!rights.canUpdate && !rights.canDelete) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {rights.canUpdate ? (
        <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
          <Pencil aria-hidden className="size-4" /> Modifier
        </Button>
      ) : null}
      {rights.canDelete ? (
        <Button
          size="sm"
          variant="danger"
          onClick={() => setConfirmDel(true)}
          disabled={orders > 0}
          title={orders > 0 ? "Société citée par des bons : suppression impossible." : undefined}
        >
          <Trash2 aria-hidden className="size-4" /> Supprimer
        </Button>
      ) : null}
      {rights.canDelete && orders > 0 ? (
        <span className="text-hint text-fg-muted">Citée par des bons : non supprimable.</span>
      ) : null}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent title="Modifier la société">{edit(() => setEditOpen(false))}</DialogContent>
      </Dialog>
      <Dialog open={confirmDel} onOpenChange={setConfirmDel}>
        <DialogContent title="Supprimer cette société ?" description="Action définitive.">
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDel(false)}>
              Retour
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const res = await safeCall(deleteSupplier(kind, id));
                  if (!res.ok) return void toast.error(res.error);
                  toast.success("Société supprimée.");
                  setConfirmDel(false);
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

// ---------------------------------------------------------------------------------------------------
// Chauffeurs, contacts, lignes desservies (bus)

function ChildSection({
  title,
  kind,
  company,
  items,
  rights,
  onChanged,
}: {
  title: string;
  kind: BusChildKind;
  company: string;
  items: Person[];
  rights: Rights;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const isLine = kind === "line";
  const remove = (id: string) =>
    start(async () => {
      const res = await safeCall(deleteBusChild(kind, id));
      if (!res.ok) return void toast.error(res.error);
      onChanged();
    });
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h3 className="label-mono text-fg-muted">
        {title} · {items.length}
      </h3>
      {items.length === 0 ? <p className="text-small text-fg-muted">Aucun.</p> : null}
      <ul className={isLine ? "flex flex-wrap gap-1.5" : "flex flex-col divide-y divide-border"}>
        {items.map((p) =>
          editing === p.id ? (
            <li key={p.id} className="w-full py-2">
              <ChildForm
                kind={kind}
                company={company}
                id={p.id}
                initial={p}
                onDone={(saved) => {
                  setEditing(null);
                  if (saved) onChanged();
                }}
              />
            </li>
          ) : (
            <li
              key={p.id}
              className={
                isLine
                  ? "inline-flex items-center gap-1 rounded-control border border-border px-2 py-1 font-mono text-small"
                  : "flex min-h-11 items-center gap-2 py-1"
              }
            >
              <span className={isLine ? "" : "min-w-0 flex-1 truncate"}>{p.name}</span>
              {!isLine && p.phone ? <PhoneLink phone={p.phone} /> : null}
              {rights.canUpdate && !isLine ? (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Modifier ${p.name}`}
                  onClick={() => setEditing(p.id)}
                >
                  <Pencil aria-hidden className="size-4" />
                </Button>
              ) : null}
              {rights.canDelete ? (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Retirer ${p.name}`}
                  disabled={pending}
                  onClick={() => remove(p.id)}
                >
                  <X aria-hidden className="size-4" />
                </Button>
              ) : null}
            </li>
          ),
        )}
      </ul>
      {rights.canWrite ? (
        <ChildForm
          kind={kind}
          company={company}
          id={null}
          initial={{ id: "", name: "", phone: "" }}
          onDone={(saved) => {
            if (saved) onChanged();
          }}
        />
      ) : null}
    </section>
  );
}

function ChildForm({
  kind,
  company,
  id,
  initial,
  onDone,
}: {
  kind: BusChildKind;
  company: string;
  id: string | null;
  initial: Person;
  onDone: (saved: boolean) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [pending, start] = useTransition();
  const isLine = kind === "line";
  const label = { driver: "chauffeur", contact: "contact", line: "ligne" }[kind];
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await safeCall(
            saveBusChild(
              company,
              id,
              isLine ? { kind: "line", line: name } : { kind, name, phone },
            ),
          );
          if (!res.ok) return void toast.error(res.error);
          if (!id) {
            setName("");
            setPhone("");
          }
          onDone(true);
        });
      }}
    >
      <label className="flex min-w-0 flex-1 basis-40 flex-col gap-1">
        <span className="text-small text-fg-muted">{isLine ? "Ligne (L.96…)" : "Nom"}</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={isLine ? 50 : 200}
          required
          aria-label={id ? `Nom du ${label}` : `Nouveau ${label}`}
        />
      </label>
      {!isLine ? (
        <label className="flex min-w-0 flex-1 basis-32 flex-col gap-1">
          <span className="text-small text-fg-muted">Téléphone</span>
          <Input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={100}
          />
        </label>
      ) : null}
      <Button type="submit" size="sm" variant="secondary" loading={pending}>
        {id ? <Check aria-hidden className="size-4" /> : <Plus aria-hidden className="size-4" />}
        {id ? "Enregistrer" : "Ajouter"}
      </Button>
      {id ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => onDone(false)}>
          Annuler
        </Button>
      ) : null}
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------
// Lignes desservies (15 oct. 2026) : choix multiple dans le référentiel `rail_lines`, enregistré en une fois.

function CompanyLines({
  company,
  stored,
  referential,
  rights,
  onChanged,
}: {
  company: string;
  stored: { id: string; line: string }[];
  referential: LineOption[];
  rights: Rights;
  onChanged: () => void;
}) {
  const choices = useMemo(() => companyLineChoices(referential, stored), [referential, stored]);
  const [values, setValues] = useState(choices.selected);
  const [pending, start] = useTransition();
  // Fiche rechargée (après enregistrement ou temps réel) : le choix repart de ce qui est enregistré.
  const key = choices.selected.join("|");
  useEffect(() => setValues(key ? key.split("|") : []), [key]);
  const diff = diffCompanyLines(stored, values);
  const dirty = diff.add.length + diff.remove.length > 0;
  const canEdit = rights.canWrite || rights.canDelete;
  const labelOf = (v: string) => choices.options.find((o) => o.value === v);
  const save = () =>
    start(async () => {
      const res = await safeCall(setBusCompanyLines(company, values));
      if (!res.ok) return void toast.error(res.error);
      toast.success(
        `Lignes enregistrées (${res.data.added} ajoutée${res.data.added > 1 ? "s" : ""}, ${res.data.removed} retirée${res.data.removed > 1 ? "s" : ""}).`,
      );
      onChanged();
    });
  return (
    <section
      className="flex flex-col gap-2"
      aria-label="Lignes desservies"
      data-testid="company-lines"
    >
      <h3 className="label-mono text-fg-muted">Lignes desservies · {choices.selected.length}</h3>
      {choices.selected.length === 0 ? <p className="text-small text-fg-muted">Aucune.</p> : null}
      <ul className="flex flex-wrap gap-1.5">
        {choices.selected.map((v) => {
          const o = labelOf(v);
          return (
            <li
              key={v}
              className="inline-flex max-w-full items-center gap-1 rounded-pill bg-surface-2 px-2.5 py-1 text-small"
              title={o?.hint ? `${o.label} (${o.hint})` : o?.label}
            >
              <span className="font-mono">{v}</span>
              {o && o.label !== v ? (
                <span className="truncate text-fg-muted">{o.label.slice(v.length + 3)}</span>
              ) : null}
              {o?.hint ? <span className="text-hint text-warn">· {o.hint}</span> : null}
            </li>
          );
        })}
      </ul>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <MultiSelect
            aria-label="Choisir les lignes desservies"
            label="Lignes desservies"
            data-testid="company-lines-select"
            options={choices.options}
            values={values}
            onValuesChange={setValues}
            searchable
            noun="ligne"
            allLabel="Aucune ligne"
            summary={
              values.length ? `Modifier les lignes (${values.length})` : "Choisir des lignes…"
            }
            className="min-w-0 flex-1 basis-56"
          />
          {dirty ? (
            <>
              <Button
                size="sm"
                variant="primary"
                loading={pending}
                onClick={save}
                data-testid="company-lines-save"
              >
                <Check aria-hidden className="size-4" /> Enregistrer
                <span className="font-mono tabular">
                  {diff.add.length ? ` +${diff.add.length}` : ""}
                  {diff.remove.length ? ` −${diff.remove.length}` : ""}
                </span>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setValues(choices.selected)}>
                Annuler
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
      {canEdit && !referential.length ? (
        <p className="text-hint text-fg-muted">
          Référentiel des lignes indisponible : seules les lignes déjà enregistrées sont proposées.
        </p>
      ) : null}
      {dirty && diff.remove.length && !rights.canDelete ? (
        <p className="text-hint text-warn">Retirer une ligne demande le droit de suppression.</p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------
// Formulaires des sociétés

function BusForm({
  id,
  initial,
  onSaved,
}: {
  id: string | null;
  initial: Required<BusCompanyInput>;
  onSaved: (id: string) => void;
}) {
  const [f, setF] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await safeCall(saveBusCompany(id, f));
          if (!res.ok) return void toast.error(res.error);
          toast.success("Société enregistrée.");
          onSaved(res.data.id);
        });
      }}
    >
      <Field label="Nom" required>
        <Input
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          required
          maxLength={200}
        />
      </Field>
      <Field label="E-mail" hint="Plusieurs adresses : séparées par « ; ».">
        <Input
          value={f.email}
          onChange={(e) => setF({ ...f, email: e.target.value })}
          maxLength={500}
          inputMode="email"
        />
      </Field>
      <Field label="Téléphone">
        <Input
          type="tel"
          inputMode="tel"
          value={f.phone}
          onChange={(e) => setF({ ...f, phone: e.target.value })}
          maxLength={100}
        />
      </Field>
      <Field label="Adresse">
        <Input
          value={f.address}
          onChange={(e) => setF({ ...f, address: e.target.value })}
          maxLength={500}
        />
      </Field>
      <Field label="Remarques" hint="Permanence, consignes… (interne, jamais dans l'e-mail).">
        <Textarea
          value={f.notes}
          onChange={(e) => setF({ ...f, notes: e.target.value })}
          maxLength={2000}
          rows={3}
        />
      </Field>
      <DialogFooter>
        <Button type="submit" variant="primary" loading={pending}>
          Enregistrer
        </Button>
      </DialogFooter>
    </form>
  );
}

function TaxiForm({
  id,
  initial,
  onSaved,
}: {
  id: string | null;
  initial: Required<TaxiCompanyInput>;
  onSaved: (id: string) => void;
}) {
  const [f, setF] = useState(initial);
  const [pending, start] = useTransition();
  const area = (key: keyof TaxiCompanyInput, label: string, hint: string, max: number) => (
    <Field label={label} hint={hint}>
      <Textarea
        value={f[key]}
        onChange={(e) => setF({ ...f, [key]: e.target.value })}
        maxLength={max}
        rows={2}
      />
    </Field>
  );
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await safeCall(saveTaxiCompany(id, f));
          if (!res.ok) return void toast.error(res.error);
          toast.success("Société enregistrée.");
          onSaved(res.data.id);
        });
      }}
    >
      <Field label="Nom" required>
        <Input
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          required
          maxLength={200}
        />
      </Field>
      {area("emails", "E-mails", "Une adresse par ligne.", 2000)}
      {area("phones", "Téléphones", "Un numéro par ligne.", 2000)}
      {area("places", "Lieux desservis", "Un lieu par ligne.", 4000)}
      {area("addresses", "Adresses", "Une adresse par ligne.", 4000)}
      {area("notes", "Remarques", "Une remarque par ligne (interne).", 4000)}
      <DialogFooter>
        <Button type="submit" variant="primary" loading={pending}>
          Enregistrer
        </Button>
      </DialogFooter>
    </form>
  );
}
