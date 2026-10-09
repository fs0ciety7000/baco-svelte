"use client";

import { Archive, ArchiveRestore, Plus, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import {
  findDuplicates,
  loadClientPanel,
  saveClient,
  setClientArchived,
} from "@/app/(app)/pmr/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Badge, StatusBadge } from "@/components/ui/status-badge";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { safeCall } from "@/lib/orders/safe-call";
import { isStatus } from "@/lib/orders/status";
import { formatDay, formatShortDay, dayOf } from "@/lib/orders/time";
import { PMR_TYPE_CODES, PMR_TYPE_LABEL, type ClientInput } from "@/lib/pmr/model";
import type { ClientDetail, ClientRow } from "@/server/data/pmr";

import { AssistBadge } from "./assist-board";
import { PhoneLink } from "./phone-link";

const typeLabel = (c: { type: string; typeDetail: string }) =>
  c.type === "AUTRE"
    ? c.typeDetail || "Autre"
    : c.type
      ? `${c.type} · ${PMR_TYPE_LABEL[c.type] ?? ""}`
      : "—";

const toInput = (c?: ClientRow | null): ClientInput => ({
  last_name: c?.lastName ?? "",
  first_name: c?.firstName ?? "",
  phone: c?.phone ?? "",
  type: (PMR_TYPE_CODES as readonly string[]).includes(c?.type ?? "")
    ? (c!.type as ClientInput["type"])
    : "",
  type_detail: c?.typeDetail ?? "",
  notes: c?.notes ?? "",
});

/** Fiches clients PMR (données de santé) : liste, fiche en panneau, prestations et taxis liés. */
export function ClientBoard({
  rows,
  canWrite,
  openId,
}: {
  rows: ClientRow[];
  canWrite: boolean;
  openId?: string;
}) {
  const router = useRouter();
  const [openRow, setOpenRow] = useState<string | null>(openId ?? null);
  // ?id= changé sans remonter la page (lien de doublon, fiche liée) : on ouvre la fiche demandée.
  useEffect(() => {
    if (openId) setOpenRow(openId);
  }, [openId]);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const wanted = useRef<string | null>(null);

  const load = useCallback(async (id: string) => {
    wanted.current = id;
    const res = await safeCall(loadClientPanel(id));
    if (wanted.current !== id) return;
    if (res.ok) setDetail(res.data);
    else toast.error(res.error);
  }, []);
  useEffect(() => {
    if (openRow) void load(openRow);
  }, [openRow, load]);

  return (
    <>
      {canWrite ? (
        <div>
          <Button variant="primary" onClick={() => setCreateOpen(true)} data-testid="client-new">
            <Plus aria-hidden /> Nouveau client
          </Button>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title="Aucun client" description="Aucune fiche pour cette recherche." />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <Th>Nom</Th>
                  <Th>Type</Th>
                  <Th>Téléphone</Th>
                  <Th>Remarques</Th>
                </tr>
              </THead>
              <tbody data-testid="clients-table">
                {rows.map((c) => (
                  <Tr key={c.id} className="cursor-pointer" onClick={() => setOpenRow(c.id)}>
                    <Td className="font-medium">
                      <button
                        type="button"
                        className="cursor-pointer text-left focus-visible:outline-1 focus-visible:outline-accent"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenRow(c.id);
                        }}
                      >
                        {c.lastName} {c.firstName}
                      </button>
                    </Td>
                    <Td className="max-w-56 truncate">{typeLabel(c)}</Td>
                    <Td className="font-mono tabular" onClick={(e) => e.stopPropagation()}>
                      {c.phone ? <PhoneLink phone={c.phone} /> : "—"}
                    </Td>
                    <Td className="max-w-80 truncate text-fg-muted">{c.notes || "—"}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden" data-testid="clients-cards">
            {rows.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="block w-full cursor-pointer text-left"
                  onClick={() => setOpenRow(c.id)}
                >
                  <ListCard
                    title={`${c.lastName} ${c.firstName}`}
                    meta={`${typeLabel(c)}${c.phone ? ` · ${c.phone}` : ""}`}
                  />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Sheet
        open={!!openRow}
        onOpenChange={(o) => {
          if (!o) {
            setOpenRow(null);
            setDetail(null);
            wanted.current = null;
          }
        }}
        eyebrow="// Client PMR"
        title={detail ? `${detail.client.lastName} ${detail.client.firstName}` : "Client"}
        description={detail ? typeLabel(detail.client) : undefined}
      >
        {!detail ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-6" data-testid="client-panel">
            {detail.client.archived ? <Badge tone="warn">Fiche archivée</Badge> : null}
            {detail.client.phone ? <PhoneLink phone={detail.client.phone} /> : null}
            {canWrite ? (
              <ClientEditor
                key={detail.client.updated}
                id={detail.client.id}
                initial={toInput(detail.client)}
                onSaved={() => {
                  void load(detail.client.id);
                  router.refresh();
                }}
              />
            ) : (
              <p className="text-body whitespace-pre-line">
                {detail.client.notes || "Aucune remarque."}
              </p>
            )}
            <section className="flex flex-col gap-2" aria-label="Prestations liées">
              <h3 className="label-mono text-fg-muted">Prestations liées ({detail.assistCount})</h3>
              {detail.assists.length === 0 ? (
                <p className="text-small text-fg-muted">Aucune.</p>
              ) : null}
              <ul className="flex flex-col gap-1.5">
                {detail.assists.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/pmr/historique?du=${a.day}&au=${a.day}`}
                      className="flex min-h-11 items-center gap-2 border border-border px-2 py-1 hover:bg-surface-2"
                    >
                      <span className="font-mono text-small tabular">
                        {formatDay(a.day)} {a.time}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-small">
                        {a.station}
                        {a.train ? ` · ${a.train}` : ""}
                      </span>
                      <AssistBadge status={a.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
            {detail.taxis.length ? (
              <section className="flex flex-col gap-2" aria-label="Taxis liés">
                <h3 className="label-mono text-fg-muted">Taxis PMR liés</h3>
                <ul className="flex flex-col gap-1.5">
                  {detail.taxis.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/commandes/taxi/${t.id}`}
                        className="flex min-h-11 items-center gap-2 border border-border px-2 py-1 hover:bg-surface-2"
                      >
                        <span className="font-mono text-small tabular">
                          {formatShortDay(dayOf(t.tripAt))}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-small">
                          n° {t.number} · {t.route}
                        </span>
                        {isStatus(t.status) ? <StatusBadge status={t.status} /> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {canWrite ? (
              <Button
                variant="ghost"
                className="self-start"
                onClick={async () => {
                  const res = await safeCall(
                    setClientArchived(detail.client.id, !detail.client.archived),
                  );
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(detail.client.archived ? "Fiche réactivée." : "Fiche archivée.");
                  void load(detail.client.id);
                  router.refresh();
                }}
              >
                {detail.client.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
                {detail.client.archived ? "Réactiver la fiche" : "Archiver la fiche"}
              </Button>
            ) : null}
          </div>
        )}
      </Sheet>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          title="Nouveau client PMR"
          description="Les fiches proches sont signalées avant d'enregistrer."
        >
          <ClientEditor
            id={null}
            initial={toInput(null)}
            onOpen={(id) => {
              setCreateOpen(false);
              setOpenRow(id);
            }}
            onSaved={(id) => {
              setCreateOpen(false);
              setOpenRow(id);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ClientEditor({
  id,
  initial,
  onSaved,
  onOpen,
}: {
  id: string | null;
  initial: ClientInput;
  onSaved: (id: string) => void;
  /** Ouvrir une fiche existante (doublon signalé). */
  onOpen?: (id: string) => void;
}) {
  const [f, setF] = useState(initial);
  const [dupes, setDupes] = useState<{ id: string; name: string }[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      if (!id && !confirmed) {
        const d = await safeCall(findDuplicates({ last_name: f.last_name, phone: f.phone }));
        if (d.ok && d.data.length) {
          setDupes(d.data);
          setConfirmed(true);
          return;
        }
      }
      const res = await safeCall(saveClient(id, f));
      if (!res.ok) return void toast.error(res.error);
      toast.success("Fiche enregistrée.");
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nom" required>
          <Input
            value={f.last_name}
            onChange={(e) => setF({ ...f, last_name: e.target.value })}
            required
            maxLength={200}
          />
        </Field>
        <Field label="Prénom">
          <Input
            value={f.first_name}
            onChange={(e) => setF({ ...f, first_name: e.target.value })}
            maxLength={200}
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
        <Field label="Type">
          <Select
            value={f.type}
            onChange={(e) => setF({ ...f, type: e.target.value as ClientInput["type"] })}
          >
            <option value="">—</option>
            {PMR_TYPE_CODES.map((t) => (
              <option key={t} value={t}>
                {t} · {PMR_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {f.type === "AUTRE" ? (
        <Field label="Précision du type">
          <Input
            value={f.type_detail}
            onChange={(e) => setF({ ...f, type_detail: e.target.value })}
            maxLength={200}
          />
        </Field>
      ) : null}
      <Field
        label="Remarques"
        hint="Besoins utiles à l'assistance ; pas d'information médicale superflue."
      >
        <Textarea
          value={f.notes}
          onChange={(e) => setF({ ...f, notes: e.target.value })}
          maxLength={4000}
        />
      </Field>
      {dupes.length ? (
        <div role="alert" className="flex flex-col gap-1 border border-warn/60 p-3 text-small">
          <p className="font-medium text-fg">Fiches proches déjà existantes :</p>
          <ul className="list-inside list-disc">
            {dupes.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  className="min-h-11 cursor-pointer link md:min-h-0"
                  onClick={() => onOpen?.(d.id)}
                >
                  {d.name}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-fg-muted">
            Enregistrer à nouveau pour créer quand même une nouvelle fiche.
          </p>
        </div>
      ) : null}
      <DialogFooter className={id ? "mx-0 mb-0 border-0 px-0" : undefined}>
        <Button type="submit" variant="primary" loading={pending} data-testid="client-save">
          <Save aria-hidden />{" "}
          {id ? "Enregistrer" : dupes.length ? "Créer quand même" : "Créer la fiche"}
        </Button>
      </DialogFooter>
    </form>
  );
}
