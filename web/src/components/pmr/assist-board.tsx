"use client";

import { Copy } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { loadAssistPanel } from "@/app/(app)/pmr/actions";
import { Button } from "@/components/ui/button";
import { Timeline } from "@/components/ui/form-kit";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/status-badge";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { safeCall } from "@/lib/orders/safe-call";
import { formatDay, pbDate } from "@/lib/orders/time";
import { DISTRICT_LABEL } from "@/lib/pmr/districts";
import {
  ASSIST_STATUS,
  assistCopyText,
  DIRECTION_IO,
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

/** Trajet d'une mission : gare de départ → gare d'arrivée. La gare d'assistance (avec l'heure) dépend du sens :
 *  départ (embarquement/IN) = on assiste au départ ; arrivée (débarquement/OUT) = on assiste à l'arrivée. */
function routeOf(a: Assist): { dep: string; arr: string; here: "dep" | "arr" } {
  if (a.direction === "arrivee")
    return { dep: a.otherStation || "?", arr: a.station || "?", here: "arr" };
  return { dep: a.station || "?", arr: a.otherStation || "?", here: "dep" };
}

/** « IN · Embarquement » / « OUT · Débarquement », ou « » si sens inconnu. */
function ioLabel(direction: string): string {
  const io = DIRECTION_IO[direction];
  return io ? `${io.io} · ${io.label}` : "";
}

/** Badge IN/OUT (embarquement / débarquement). */
function IoBadge({ direction }: { direction: string }) {
  const io = DIRECTION_IO[direction];
  if (!io) return <span className="text-fg-muted">—</span>;
  return (
    <Badge tone={io.tone} title={io.label}>
      {io.io}
    </Badge>
  );
}

/** Trajet affiché : départ → arrivée, la gare d'assistance soulignée. */
function RouteText({ a, barred }: { a: Assist; barred?: boolean }) {
  const r = routeOf(a);
  const mark = (s: string, is: boolean) =>
    is ? (
      <span className="font-medium text-fg underline decoration-dotted underline-offset-2">{s}</span>
    ) : (
      <span>{s}</span>
    );
  return (
    <span className={barred ? "line-through" : ""}>
      {mark(r.dep, r.here === "dep")} <span className="text-fg-muted">→</span>{" "}
      {mark(r.arr, r.here === "arr")}
    </span>
  );
}

async function copyLabel(a: Assist) {
  const text = assistCopyText(a);
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copié : ${text}`);
  } catch {
    toast.error("Copie impossible (presse-papiers indisponible).");
  }
}

/** Bouton « copier le libellé » (ex. « Embarquement d'une chaise roulante »). */
function CopyButton({ a, label }: { a: Assist; label?: boolean }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="border border-border"
      aria-label={`Copier le libellé : ${assistCopyText(a)}`}
      title={assistCopyText(a)}
      onClick={(e) => {
        e.stopPropagation();
        void copyLabel(a);
      }}
    >
      <Copy aria-hidden className="size-4" />
      {label ? "Copier" : null}
    </Button>
  );
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

/** Missions PMR (lecture seule, synchronisées depuis DICOS) : table (cartes en mobile), détail en panneau latéral,
 *  bouton « copier le libellé ». Aucune édition : le statut et les données viennent de DICOS. */
export function AssistBoard({
  rows,
  canPmr,
  groupByDay,
}: {
  rows: Assist[];
  canPmr: boolean;
  groupByDay: boolean;
}) {
  const [open, setOpen] = useState<Assist | null>(null);
  const [panel, setPanel] = useState<{ assist: Assist; events: PmrEvent[] } | null>(null);
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

  if (rows.length === 0)
    return <EmptyState title="Aucune mission" description="Aucune mission PMR pour ces filtres." />;

  const days = groupByDay ? [...new Set(rows.map((r) => r.day))] : [""];
  const routeLabel = (a: Assist) => {
    const r = routeOf(a);
    return `${r.dep} → ${r.arr}`;
  };

  return (
    <>
      {days.map((d) => {
        const list = d ? rows.filter((r) => r.day === d) : rows;
        return (
          <section
            key={d || "tout"}
            className="flex flex-col gap-2"
            aria-label={d ? formatDay(d) : "Missions PMR"}
          >
            {d ? (
              <h2 className="label-mono text-fg-muted first-letter:uppercase">
                {formatDay(d)} · {list.length} mission(s)
              </h2>
            ) : null}
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr>
                    {!groupByDay ? <Th>Date</Th> : null}
                    <Th>Heure</Th>
                    <Th>Trajet (départ → arrivée)</Th>
                    <Th>District</Th>
                    <Th>Sens</Th>
                    <Th>Train</Th>
                    <Th>Voyageur</Th>
                    <Th>Réf. DICOS</Th>
                    <Th>Statut</Th>
                    <Th>Copier</Th>
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
                          aria-label={`Ouvrir la mission de ${a.time || "—"} à ${a.station}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            show(a);
                          }}
                        >
                          {a.time || "--:--"}
                        </button>
                      </Td>
                      <Td className="max-w-72">
                        <RouteText a={a} barred={a.status === "annulee"} />
                      </Td>
                      <Td className="font-mono text-fg-muted" title={DISTRICT_LABEL[a.district] ?? ""}>
                        {a.district || "—"}
                      </Td>
                      <Td>
                        <IoBadge direction={a.direction} />
                      </Td>
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
                      <Td>
                        <CopyButton a={a} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <ul className="flex flex-col gap-2 md:hidden" data-testid="assists-cards">
              {list.map((a) => (
                <li key={a.id} className="flex items-stretch gap-2">
                  <button
                    type="button"
                    className="block flex-1 cursor-pointer text-left"
                    onClick={() => show(a)}
                  >
                    <ListCard
                      statusColor={toneVar[ASSIST_STATUS[a.status].tone]}
                      title={
                        <span className="inline-flex items-center gap-2">
                          <span className="font-mono tabular">{a.time || "--:--"}</span>
                          <span className={a.status === "annulee" ? "line-through" : ""}>
                            {routeLabel(a)}
                          </span>
                        </span>
                      }
                      meta={`${!groupByDay ? `${formatDay(a.day)} · ` : ""}${DIRECTION_IO[a.direction]?.io ?? ""}${a.train ? ` · ${a.train}` : ""} · ${a.pax} × ${a.pmrType || "?"}${a.district ? ` · ${a.district}` : ""}${canPmr && a.clientName ? ` · ${a.clientName}` : ""}`}
                      aside={<AssistBadge status={a.status} />}
                    />
                  </button>
                  <CopyButton a={a} />
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
        eyebrow={open ? `// Mission PMR · ${formatDay(open.day)}` : undefined}
        title={open ? `${open.time || "--:--"} · ${open.station || "?"}` : "Mission PMR"}
        description={
          open
            ? `${ioLabel(open.direction) || "Sens ?"}${open.train ? ` · train ${open.train}` : ""}`
            : undefined
        }
      >
        {!panel ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-5" data-testid="assist-panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <AssistBadge status={panel.assist.status} />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void copyLabel(panel.assist)}
                aria-label={`Copier le libellé : ${assistCopyText(panel.assist)}`}
              >
                <Copy aria-hidden className="size-4" /> Copier le libellé
              </Button>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
              <dt className="text-small text-fg-muted">Trajet</dt>
              <dd>
                <RouteText a={panel.assist} />
                {panel.assist.time ? (
                  <span className="text-fg-muted">
                    {" "}
                    · {DIRECTION_IO[panel.assist.direction]?.io === "OUT" ? "arrivée" : "départ"}{" "}
                    {panel.assist.time}
                  </span>
                ) : null}
              </dd>
              <dt className="text-small text-fg-muted">Sens</dt>
              <dd>
                {ioLabel(panel.assist.direction)
                  ? `${ioLabel(panel.assist.direction)} (${DIRECTION_LABEL[panel.assist.direction]})`
                  : "—"}
              </dd>
              <dt className="text-small text-fg-muted">District</dt>
              <dd>
                {panel.assist.district
                  ? `${panel.assist.district} · ${DISTRICT_LABEL[panel.assist.district] ?? ""}`
                  : "—"}
              </dd>
              <dt className="text-small text-fg-muted">Voyageur</dt>
              <dd>
                {panel.assist.pax} ×{" "}
                {panel.assist.pmrType
                  ? `${panel.assist.pmrType} · ${PMR_TYPE_LABEL[panel.assist.pmrType] ?? ""}`
                  : "type ?"}
              </dd>
              <dt className="text-small text-fg-muted">Réf. DICOS</dt>
              <dd className="font-mono">{panel.assist.dicosRef || "—"}</dd>
              <dt className="text-small text-fg-muted">Client</dt>
              <dd>
                {canPmr && panel.assist.clientName ? (
                  <span className="flex flex-col">
                    {panel.assist.clientId ? (
                      <Link
                        className="text-accent underline-offset-2 hover:underline"
                        href={`/pmr/clients?id=${panel.assist.clientId}`}
                      >
                        {panel.assist.clientName}
                      </Link>
                    ) : (
                      <span>{panel.assist.clientName}</span>
                    )}
                    {panel.assist.clientPhone ? <PhoneLink phone={panel.assist.clientPhone} /> : null}
                  </span>
                ) : panel.assist.clientId || panel.assist.clientName ? (
                  "Voyageur enregistré (droit PMR requis pour le voir)"
                ) : (
                  "—"
                )}
              </dd>
              {canPmr && panel.assist.mission ? (
                <>
                  {panel.assist.mission.clientEmail ? (
                    <>
                      <dt className="text-small text-fg-muted">E-mail</dt>
                      <dd className="break-all">{panel.assist.mission.clientEmail}</dd>
                    </>
                  ) : null}
                  {panel.assist.mission.clientLang ? (
                    <>
                      <dt className="text-small text-fg-muted">Langue</dt>
                      <dd>{panel.assist.mission.clientLang}</dd>
                    </>
                  ) : null}
                  {panel.assist.mission.clientDesc ? (
                    <>
                      <dt className="text-small text-fg-muted">Précisions</dt>
                      <dd>{panel.assist.mission.clientDesc}</dd>
                    </>
                  ) : null}
                  {panel.assist.mission.meetingPoint ? (
                    <>
                      <dt className="text-small text-fg-muted">Point de rencontre</dt>
                      <dd>{panel.assist.mission.meetingPoint}</dd>
                    </>
                  ) : null}
                  {panel.assist.mission.coach || panel.assist.mission.door ? (
                    <>
                      <dt className="text-small text-fg-muted">Voiture / porte</dt>
                      <dd>
                        {[
                          panel.assist.mission.coach ? `voiture ${panel.assist.mission.coach}` : "",
                          panel.assist.mission.door ? `porte ${panel.assist.mission.door}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </dd>
                    </>
                  ) : null}
                  {panel.assist.mission.trainManagerName ||
                  panel.assist.mission.trainManagerPhone ? (
                    <>
                      <dt className="text-small text-fg-muted">Accompagnateur</dt>
                      <dd className="flex flex-col">
                        <span>{panel.assist.mission.trainManagerName || "—"}</span>
                        {panel.assist.mission.trainManagerPhone ? (
                          <PhoneLink phone={panel.assist.mission.trainManagerPhone} />
                        ) : null}
                      </dd>
                    </>
                  ) : null}
                  {panel.assist.mission.driverName || panel.assist.mission.driverPhone ? (
                    <>
                      <dt className="text-small text-fg-muted">Conducteur</dt>
                      <dd className="flex flex-col">
                        <span>{panel.assist.mission.driverName || "—"}</span>
                        {panel.assist.mission.driverPhone ? (
                          <PhoneLink phone={panel.assist.mission.driverPhone} />
                        ) : null}
                      </dd>
                    </>
                  ) : null}
                  {panel.assist.mission.ownerName ? (
                    <>
                      <dt className="text-small text-fg-muted">Affectée à</dt>
                      <dd>{panel.assist.mission.ownerName}</dd>
                    </>
                  ) : null}
                </>
              ) : null}
              {panel.assist.cancelReason ? (
                <>
                  <dt className="text-small text-fg-muted">Motif</dt>
                  <dd className="text-danger">{panel.assist.cancelReason}</dd>
                </>
              ) : null}
              {panel.assist.note ? (
                <>
                  <dt className="text-small text-fg-muted">Remarque</dt>
                  <dd>{panel.assist.note}</dd>
                </>
              ) : null}
              <dt className="text-small text-fg-muted">Saisie</dt>
              <dd>{panel.assist.legacy ? "Reprise de BACO" : panel.assist.author || "—"}</dd>
            </dl>
            {panel.assist.anonymized ? (
              <p className="text-small text-fg-muted">Mission anonymisée (plus de 12 mois).</p>
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
    </>
  );
}
