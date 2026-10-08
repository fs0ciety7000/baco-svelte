"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { loadAssistPanel, transitionAssist } from "@/app/(app)/pmr/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Timeline } from "@/components/ui/form-kit";
import { Textarea } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/status-badge";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { safeCall } from "@/lib/orders/safe-call";
import { formatDay, pbDate } from "@/lib/orders/time";
import {
  ASSIST_STATUS,
  assistTransitions,
  DIRECTION_LABEL,
  PMR_TYPE_LABEL,
  type AssistStatus,
} from "@/lib/pmr/model";
import type { Assist, PmrEvent } from "@/server/data/pmr";

import { PhoneLink } from "./phone-link";

const toneVar = {
  info: "var(--info)",
  ok: "var(--ok)",
  danger: "var(--danger)",
  warn: "var(--warn)",
};
export function AssistBadge({ status }: { status: AssistStatus }) {
  const s = ASSIST_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const at = new Intl.DateTimeFormat("fr-BE", {
  timeZone: "Europe/Brussels",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const FIELD_LABEL: Record<string, string> = {
  time: "Heure",
  station: "Gare",
  train: "Train",
  day: "Date",
  client: "Client",
};

function eventTitle(e: PmrEvent) {
  if (e.field === "status") {
    const to = ASSIST_STATUS[e.to as AssistStatus]?.label ?? e.to;
    return e.from
      ? `${ASSIST_STATUS[e.from as AssistStatus]?.label ?? e.from} → ${to}`
      : `Création · ${to}`;
  }
  return `${FIELD_LABEL[e.field] ?? e.field} : ${e.from || "—"} → ${e.to || "—"}`;
}

/** Prestations PMR : table (cartes en mobile), détail en panneau latéral, transitions avec motif. */
export function AssistBoard({
  rows,
  canWrite,
  canPmr,
  groupByDay,
}: {
  rows: Assist[];
  canWrite: boolean;
  canPmr: boolean;
  groupByDay: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Assist | null>(null);
  const [panel, setPanel] = useState<{ assist: Assist; events: PmrEvent[] } | null>(null);
  const [reasonFor, setReasonFor] = useState<{ to: AssistStatus; label: string } | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const wanted = useRef<string | null>(null);

  const load = useCallback(async (id: string) => {
    wanted.current = id;
    const res = await safeCall(loadAssistPanel(id));
    if (wanted.current !== id) return;
    if (res.ok) setPanel(res.data);
    else toast.error(res.error);
  }, []);
  const show = (a: Assist) => {
    setOpen(a);
    setPanel(null);
    void load(a.id);
  };
  const openUpdated = open ? rows.find((r) => r.id === open.id)?.updated : undefined;
  useEffect(() => {
    if (open && openUpdated) void load(open.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openUpdated]);

  const transition = (to: AssistStatus, why?: string) =>
    start(async () => {
      if (!open) return;
      const res = await safeCall(transitionAssist({ id: open.id, to, reason: why }));
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Prestation : ${ASSIST_STATUS[to].label.toLowerCase()}.`);
      setReasonFor(null);
      setReason("");
      void load(open.id);
      router.refresh();
    });

  if (rows.length === 0)
    return (
      <EmptyState title="Aucune prestation" description="Aucune prestation PMR pour ces filtres." />
    );

  const days = groupByDay ? [...new Set(rows.map((r) => r.day))] : [""];
  const label = (a: Assist) =>
    `${a.station || "?"}${a.direction ? ` · ${DIRECTION_LABEL[a.direction]}` : ""}${a.train ? ` · ${a.train}` : ""}`;

  return (
    <>
      {days.map((d) => {
        const list = d ? rows.filter((r) => r.day === d) : rows;
        return (
          <section
            key={d || "tout"}
            className="flex flex-col gap-2"
            aria-label={d ? formatDay(d) : "Prestations"}
          >
            {d ? (
              <h2 className="label-mono text-fg-muted first-letter:uppercase">
                {formatDay(d)} · {list.length} prestation(s)
              </h2>
            ) : null}
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr>
                    {!groupByDay ? <Th>Date</Th> : null}
                    <Th>Heure</Th>
                    <Th>Gare</Th>
                    <Th>Zone</Th>
                    <Th>Sens</Th>
                    <Th>Train</Th>
                    <Th>Voyageur</Th>
                    <Th>Réf. DICOS</Th>
                    <Th>Statut</Th>
                  </tr>
                </THead>
                <tbody data-testid="assists-table">
                  {list.map((a) => (
                    <Tr
                      key={a.id}
                      statusColor={toneVar[ASSIST_STATUS[a.status].tone]}
                      className="cursor-pointer"
                      onClick={() => show(a)}
                    >
                      {!groupByDay ? (
                        <Td className="font-mono tabular">{formatDay(a.day)}</Td>
                      ) : null}
                      <Td className="font-mono tabular">
                        <button
                          type="button"
                          className="cursor-pointer focus-visible:outline-1 focus-visible:outline-accent"
                          aria-label={`Ouvrir la prestation de ${a.time || "—"} à ${a.station}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            show(a);
                          }}
                        >
                          {a.time || "--:--"}
                        </button>
                      </Td>
                      <Td className={a.status === "annulee" ? "line-through" : ""}>
                        {a.station || "—"}
                      </Td>
                      <Td className="font-mono text-fg-muted">{a.zoneCode || "—"}</Td>
                      <Td>{DIRECTION_LABEL[a.direction] ?? "—"}</Td>
                      <Td className="font-mono">{a.train || "—"}</Td>
                      <Td className="max-w-56 truncate">
                        {a.pax} × {a.pmrType || "?"}
                        {canPmr && a.clientName ? (
                          <span className="text-fg-muted"> · {a.clientName}</span>
                        ) : null}
                      </Td>
                      <Td className="font-mono text-small text-fg-muted">{a.dicosRef || "—"}</Td>
                      <Td>
                        <AssistBadge status={a.status} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <ul className="flex flex-col gap-2 md:hidden" data-testid="assists-cards">
              {list.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="block w-full cursor-pointer text-left"
                    onClick={() => show(a)}
                  >
                    <ListCard
                      statusColor={toneVar[ASSIST_STATUS[a.status].tone]}
                      title={
                        <span className="inline-flex items-center gap-2">
                          <span className="font-mono tabular">{a.time || "--:--"}</span> {label(a)}
                        </span>
                      }
                      meta={`${!groupByDay ? `${formatDay(a.day)} · ` : ""}${a.pax} × ${a.pmrType || "?"}${a.zoneCode ? ` · ${a.zoneCode}` : ""}${canPmr && a.clientName ? ` · ${a.clientName}` : ""}`}
                      aside={<AssistBadge status={a.status} />}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <Sheet
        open={!!open}
        onOpenChange={(o) => {
          if (!o) {
            setOpen(null);
            setPanel(null);
            wanted.current = null;
          }
        }}
        eyebrow={open ? `// Prestation PMR · ${formatDay(open.day)}` : undefined}
        title={open ? `${open.time || "--:--"} · ${open.station || "?"}` : "Prestation"}
        description={
          open
            ? `${DIRECTION_LABEL[open.direction] ?? "Sens ?"}${open.train ? ` · train ${open.train}` : ""}`
            : undefined
        }
        footer={
          open && panel && canWrite && !panel.assist.anonymized ? (
            <div className="flex w-full flex-wrap gap-2">
              {assistTransitions(panel.assist.status).map((t) => (
                <Button
                  key={t.to}
                  size="sm"
                  variant={
                    t.to === "realisee" ? "primary" : t.to === "annulee" ? "danger" : "secondary"
                  }
                  disabled={pending}
                  onClick={() =>
                    t.needsReason ? setReasonFor({ to: t.to, label: t.label }) : transition(t.to)
                  }
                  data-testid={`assist-${t.to}`}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          ) : null
        }
      >
        {!panel ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-5" data-testid="assist-panel">
            <AssistBadge status={panel.assist.status} />
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
              <dt className="text-small text-fg-muted">Voyageur</dt>
              <dd>
                {panel.assist.pax} ×{" "}
                {panel.assist.pmrType
                  ? `${panel.assist.pmrType} · ${PMR_TYPE_LABEL[panel.assist.pmrType] ?? ""}`
                  : "type ?"}
              </dd>
              <dt className="text-small text-fg-muted">Réf. DICOS</dt>
              <dd className="font-mono">{panel.assist.dicosRef || "—"}</dd>
              <dt className="text-small text-fg-muted">Zone</dt>
              <dd>{panel.assist.zoneCode || "—"}</dd>
              <dt className="text-small text-fg-muted">Client</dt>
              <dd>
                {canPmr && panel.assist.clientName ? (
                  <span className="flex flex-col">
                    <Link
                      className="text-accent underline-offset-2 hover:underline"
                      href={`/pmr/clients?id=${panel.assist.clientId}`}
                    >
                      {panel.assist.clientName}
                    </Link>
                    {panel.assist.clientPhone ? (
                      <PhoneLink phone={panel.assist.clientPhone} />
                    ) : null}
                  </span>
                ) : panel.assist.clientId ? (
                  "Client lié (droit PMR requis pour le voir)"
                ) : (
                  "—"
                )}
              </dd>
              {panel.assist.note ? (
                <>
                  <dt className="text-small text-fg-muted">Remarque</dt>
                  <dd>{panel.assist.note}</dd>
                </>
              ) : null}
              {panel.assist.cancelReason ? (
                <>
                  <dt className="text-small text-fg-muted">Motif</dt>
                  <dd className="text-danger">{panel.assist.cancelReason}</dd>
                </>
              ) : null}
              <dt className="text-small text-fg-muted">Saisie</dt>
              <dd>{panel.assist.legacy ? "Reprise de BACO" : panel.assist.author || "—"}</dd>
            </dl>
            {panel.assist.anonymized ? (
              <p className="text-small text-fg-muted">Prestation anonymisée (plus de 12 mois).</p>
            ) : null}
            {panel.assist.legacyText ? (
              <details className="text-small">
                <summary className="cursor-pointer text-fg-muted">
                  Texte d&apos;origine (BACO)
                </summary>
                <p className="mt-2 font-mono break-words">{panel.assist.legacyText}</p>
              </details>
            ) : null}
            <section className="flex flex-col gap-3" aria-label="Historique">
              <h3 className="label-mono text-fg-muted">Historique</h3>
              <Timeline
                items={panel.events.map((e) => {
                  const d = pbDate(e.at);
                  return {
                    id: e.id,
                    title: eventTitle(e),
                    meta: `${e.by}${d ? ` · ${at.format(d)}` : ""}`,
                    note: e.note || undefined,
                    color:
                      e.field === "status"
                        ? toneVar[ASSIST_STATUS[e.to as AssistStatus]?.tone ?? "info"]
                        : undefined,
                  };
                })}
              />
            </section>
          </div>
        )}
      </Sheet>

      {reasonFor ? (
        <Dialog open onOpenChange={(o) => !o && setReasonFor(null)}>
          <DialogContent
            title={reasonFor.label}
            description="Le motif est gardé dans l'historique."
          >
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                transition(reasonFor.to, reason);
              }}
            >
              <Field label="Motif" required>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  required
                  autoFocus
                />
              </Field>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setReasonFor(null)}>
                  Retour
                </Button>
                <Button type="submit" variant="danger" loading={pending} disabled={!reason.trim()}>
                  {reasonFor.label}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
