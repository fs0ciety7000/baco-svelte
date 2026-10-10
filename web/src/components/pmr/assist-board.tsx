"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn, pl } from "@/lib/utils";
import { loadAssistPanel } from "@/app/(app)/pmr/actions";
import { Timeline } from "@/components/ui/form-kit";
import { LiveHighlight } from "@/components/ui/live-highlight";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/status-badge";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { safeCall } from "@/lib/orders/safe-call";
import { formatDay, pbDate } from "@/lib/orders/time";
import { DISTRICT_LABEL } from "@/lib/pmr/districts";

import {
  aleaGroups,
  ASSIST_STATUS,
  assistCopyText,
  DIRECTION_IO,
  DIRECTION_LABEL,
  PMR_TYPE_LABEL,
  type AleaEnd,
  type AssistStatus,
} from "@/lib/pmr/model";
import { missionImpact, type TrainStates } from "@/lib/pmr/train-delay";
import type { Assist, PmrEvent } from "@/server/data/pmr";

import { AleaButton } from "./alea-export";
import { CopyButton } from "./copy";
import { PhoneLink } from "./phone-link";
import { DelayBadge, TrainChip } from "./train-chip";

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

/** Un trajet DICOS v3 porte ses deux bouts (gare + heure + district, assistance IN au départ / OUT à l'arrivée).
 *  Une ancienne ligne (v2, BACO) n'a qu'une gare d'assistance + un sens : on la ramène au même modèle. */
export type Leg = {
  dep: string;
  depTime: string;
  depDistrict: string;
  arr: string;
  arrTime: string;
  arrDistrict: string;
  inA: boolean;
  outA: boolean;
};
function legOf(a: Assist): Leg {
  if (a.inAssist || a.outAssist || a.arrTime || a.transport)
    return {
      dep: a.station || "—",
      depTime: a.time,
      depDistrict: a.district,
      arr: a.otherStation || "—",
      arrTime: a.arrTime,
      arrDistrict: a.arrDistrict,
      inA: a.inAssist,
      outA: a.outAssist,
    };
  if (a.direction === "arrivee")
    return {
      dep: a.otherStation || "—",
      depTime: "",
      depDistrict: "",
      arr: a.station || "—",
      arrTime: a.time,
      arrDistrict: a.district,
      inA: false,
      outA: true,
    };
  return {
    dep: a.station || "—",
    depTime: a.time,
    depDistrict: a.district,
    arr: a.otherStation || "—",
    arrTime: "",
    arrDistrict: "",
    inA: a.direction === "depart",
    outA: false,
  };
}

/** Bouts d'assistance retenus : ceux du district filtré s'il y en a un, sinon tous. */
function assistedEnds(l: Leg, district: string): ("depart" | "arrivee")[] {
  const all: ("depart" | "arrivee")[] = [];
  if (l.inA) all.push("depart");
  if (l.outA) all.push("arrivee");
  if (!district) return all;
  const inDistrict = all.filter(
    (e) => (e === "depart" ? l.depDistrict : l.arrDistrict) === district,
  );
  return inDistrict.length ? inDistrict : all;
}

/** « IN · Embarquement » / « OUT · Débarquement », ou « » si sens inconnu. */
function ioLabel(direction: string): string {
  const io = DIRECTION_IO[direction];
  return io ? `${io.io} · ${io.label}` : "";
}

/** Badges IN / OUT d'un trajet (les deux si assistance aux deux bouts). */
export function IoBadges({ leg, district }: { leg: Leg; district: string }) {
  if (!leg.inA && !leg.outA) return <span className="text-fg-muted">—</span>;
  // Sens IN / OUT en badges neutres (les couleurs de statut restent aux statuts) ; hors district : estompé à 60 %.
  const dim = (d: string) => (district && d !== district ? "opacity-60" : "");
  return (
    <span className="inline-flex gap-1">
      {leg.inA ? (
        <Badge
          tone="neutral"
          title="Embarquement (gare de départ)"
          className={dim(leg.depDistrict)}
        >
          IN
        </Badge>
      ) : null}
      {leg.outA ? (
        <Badge
          tone="neutral"
          title="Débarquement (gare d'arrivée)"
          className={dim(leg.arrDistrict)}
        >
          OUT
        </Badge>
      ) : null}
    </span>
  );
}

export const HIGHLIGHT =
  "rounded-[min(var(--r-control),4px)] bg-[color-mix(in_oklab,var(--fg)_12%,transparent)] px-1 font-semibold text-fg";

/** Trajet : « 06:02 GARE A → 06:55 GARE B ». Gare d'assistance soulignée ; gare du district filtré surlignée. */
function RouteText({ a, district, barred }: { a: Assist; district: string; barred?: boolean }) {
  const l = legOf(a);
  const end = (name: string, time: string, assisted: boolean, d: string) => (
    // Gare assistée toujours surlignée (IN → départ, OUT → arrivée) ; avec un filtre district, seulement celles du
    // district (retour utilisateur du 9 oct. 2026).
    <span className={assisted && (!district || d === district) ? HIGHLIGHT : ""}>
      {time ? <span className="font-mono tabular text-fg-muted">{time} </span> : null}
      <span
        className={
          assisted ? "font-medium text-fg underline decoration-dotted underline-offset-2" : ""
        }
      >
        {name}
      </span>
    </span>
  );
  return (
    <span className={barred ? "line-through" : ""}>
      {end(l.dep, l.depTime, l.inA, l.depDistrict)} <span className="text-fg-muted">→</span>{" "}
      {end(l.arr, l.arrTime, l.outA, l.arrDistrict)}
    </span>
  );
}

/** Libellé à copier d'un trajet : une phrase par bout d'assistance retenu (« Embarquement d'une chaise roulante »). */
function copyTextOf(a: Assist, district: string): string {
  const ends = assistedEnds(legOf(a), district);
  if (!ends.length) return assistCopyText(a);
  return ends.map((direction) => assistCopyText({ ...a, direction })).join(" / ");
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
  district = "",
  notSynced = false,
  delays,
}: {
  rows: Assist[];
  /** États iRail des trains du jour (« jour|train », `listTrainStates`) : badge de retard à la gare assistée. */
  delays?: TrainStates;
  canPmr: boolean;
  groupByDay: boolean;
  /** Aucune synchro DICOS pour la période : état vide distinct de « aucune mission ». */
  notSynced?: boolean;
  /** District filtré : ses gares sont surlignées, ses bouts d'assistance retenus pour le libellé à copier. */
  district?: string;
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
    return notSynced ? (
      <EmptyState
        title="Pas encore synchronisé"
        description="Aucune synchro DICOS pour cette période : lance la synchro depuis l'extension (onglet DICOS ouvert) pour voir les missions."
      />
    ) : (
      <EmptyState title="Aucune mission" description="Aucune mission PMR pour ces filtres." />
    );

  const days = groupByDay ? [...new Set(rows.map((r) => r.day))] : [""];
  const routeLabel = (a: Assist) => {
    const l = legOf(a);
    return `${l.dep}${l.arrTime ? "" : ""} → ${l.arrTime ? `${l.arrTime} ` : ""}${l.arr}`;
  };
  const districtsOf = (a: Assist) => {
    const l = legOf(a);
    if (!l.arrDistrict || l.arrDistrict === l.depDistrict)
      return l.depDistrict || l.arrDistrict || "";
    // Gare hors des 3 districts (Flandre, étranger) : « hors » plutôt qu'un « ? » ambigu.
    return `${l.depDistrict || "hors"} → ${l.arrDistrict}`;
  };

  return (
    <>
      <LiveHighlight
        scope="assists"
        context={`${district}|${rows[0]?.day ?? ""}|${rows.at(-1)?.day ?? ""}`}
        sigs={Object.fromEntries(rows.map((r) => [r.id, `${r.status}|${r.updated}`]))}
      />
      <div className="flex justify-end">
        <AleaExport rows={rows} district={district} />
      </div>
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
                {formatDay(d)} · {list.length} {pl(list.length, "mission")}
              </h2>
            ) : null}
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr>
                    <Th>Train</Th>
                    {!groupByDay ? <Th>Date</Th> : null}
                    <Th>Heure</Th>
                    <Th>Trajet (départ → arrivée)</Th>
                    <Th>District</Th>
                    <Th>Sens</Th>
                    <Th>Voyageur</Th>
                    <Th>Réf. DICOS</Th>
                    <Th>Statut</Th>
                    <Th>Copier</Th>
                  </tr>
                </THead>
                <tbody data-testid="assists-table" data-hl-scope="assists">
                  {list.map((a) => (
                    <Tr
                      key={a.id}
                      data-hl={a.id}
                      selected={open?.id === a.id}
                      statusColor={toneVar[ASSIST_STATUS[a.status].tone]}
                      className="cursor-pointer"
                      onClick={() => show(a)}
                    >
                      <Td>
                        <span className="inline-flex items-center gap-1.5">
                          <TrainChip train={a.train} taxi={a.transport === "taxi"} />
                          <DelayBadge impact={missionImpact(a, delays)} />
                        </span>
                      </Td>
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
                        <RouteText a={a} district={district} barred={a.status === "annulee"} />
                      </Td>
                      <Td className="font-mono whitespace-nowrap text-fg-muted">
                        {districtsOf(a) || "—"}
                      </Td>
                      <Td>
                        <IoBadges leg={legOf(a)} district={district} />
                      </Td>
                      <Td className="max-w-56 truncate">
                        {a.pax} × {a.pmrType || "type ?"}
                        {canPmr && a.clientName ? (
                          <span className="text-fg-muted"> · {a.clientName}</span>
                        ) : null}
                      </Td>
                      <Td className="font-mono text-small text-fg-muted">{a.dicosRef || "—"}</Td>
                      <Td>
                        <AssistBadge status={a.status} />
                      </Td>
                      <Td>
                        <CopyButton text={copyTextOf(a, district)} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <ul
              className="flex flex-col gap-2 md:hidden"
              data-testid="assists-cards"
              data-hl-scope="assists"
            >
              {list.map((a) => (
                // Carte mobile (audit UI du 9 oct. 2026) : train + heure + statut, trajet en entier sur sa ligne,
                // détails, bouton Copier dans la carte (en bas à droite).
                <li key={a.id} className="relative min-w-0">
                  <button
                    type="button"
                    data-hl={a.id}
                    style={
                      { "--status": toneVar[ASSIST_STATUS[a.status].tone] } as React.CSSProperties
                    }
                    className="flex w-full min-w-0 cursor-pointer flex-col gap-1 rounded-box border border-border border-l-[3px] border-l-(--status) bg-surface px-3 py-2.5 pr-14 text-left"
                    onClick={() => show(a)}
                  >
                    <span className="flex items-center gap-2 pr-0">
                      <TrainChip train={a.train} taxi={a.transport === "taxi"} />
                      <DelayBadge impact={missionImpact(a, delays)} />
                      <span className="font-mono tabular">{a.time || "--:--"}</span>
                      <span className="-mr-11 ml-auto">
                        <AssistBadge status={a.status} />
                      </span>
                    </span>
                    <span
                      className={cn(
                        "text-body font-medium text-fg",
                        a.status === "annulee" && "line-through",
                      )}
                    >
                      {routeLabel(a)}
                    </span>
                    <span className="text-small text-fg-muted">
                      {`${!groupByDay ? `${formatDay(a.day)} · ` : ""}${[legOf(a).inA ? "IN" : "", legOf(a).outA ? "OUT" : ""].filter(Boolean).join("+") || "—"} · ${a.pax} × ${a.pmrType || "type ?"}${districtsOf(a) ? ` · ${districtsOf(a)}` : ""}${canPmr && a.clientName ? ` · ${a.clientName}` : ""}`}
                    </span>
                  </button>
                  <span className="absolute right-2 bottom-2">
                    <CopyButton text={copyTextOf(a, district)} />
                  </span>
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
        title={
          open ? `${open.time || "--:--"} · ${legOf(open).dep} → ${legOf(open).arr}` : "Mission PMR"
        }
        description={
          open
            ? `${[legOf(open).inA ? "IN" : "", legOf(open).outA ? "OUT" : ""].filter(Boolean).join(" + ") || ioLabel(open.direction) || "Sens ?"}${open.transport === "taxi" ? ` · taxi ${open.train}` : open.train ? ` · train ${open.train}` : ""}`
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
              <CopyButton
                text={copyTextOf(panel.assist, district)}
                label="Copier le libellé"
                variant="secondary"
              />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
              <dt className="text-small text-fg-muted">Trajet</dt>
              <dd>
                <RouteText a={panel.assist} district={district} />
              </dd>
              <dt className="text-small text-fg-muted">Assistance</dt>
              <dd className="flex flex-col">
                {legOf(panel.assist).inA ? (
                  <span>IN · embarquement à {legOf(panel.assist).dep}</span>
                ) : null}
                {legOf(panel.assist).outA ? (
                  <span>OUT · débarquement à {legOf(panel.assist).arr}</span>
                ) : null}
                {!legOf(panel.assist).inA && !legOf(panel.assist).outA
                  ? ioLabel(panel.assist.direction)
                    ? `${ioLabel(panel.assist.direction)} (${DIRECTION_LABEL[panel.assist.direction]})`
                    : "—"
                  : null}
              </dd>
              <dt className="text-small text-fg-muted">District</dt>
              <dd>
                {[legOf(panel.assist).depDistrict, legOf(panel.assist).arrDistrict]
                  .filter(Boolean)
                  .map((d) => `${d} · ${DISTRICT_LABEL[d] ?? ""}`)
                  .filter((v, i, arr) => arr.indexOf(v) === i)
                  .join(" → ") || "—"}
              </dd>
              <dt className="text-small text-fg-muted">Transport</dt>
              <dd>
                {panel.assist.transport === "taxi"
                  ? `Taxi · ${panel.assist.train || "—"}`
                  : `Train ${panel.assist.train || "—"}`}
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
                      <Link className="link" href={`/pmr/clients?id=${panel.assist.clientId}`}>
                        {panel.assist.clientName}
                      </Link>
                    ) : (
                      <span>{panel.assist.clientName}</span>
                    )}
                  </span>
                ) : panel.assist.clientId || panel.assist.clientName ? (
                  "Voyageur enregistré (droit PMR requis pour le voir)"
                ) : (
                  "—"
                )}
              </dd>
              {canPmr && panel.assist.clientPhone ? (
                <>
                  <dt className="text-small text-fg-muted">Téléphone</dt>
                  <dd>
                    <PhoneLink phone={panel.assist.clientPhone} />
                  </dd>
                </>
              ) : null}
              {canPmr && panel.assist.mission?.clientEmail ? (
                <>
                  <dt className="text-small text-fg-muted">E-mail</dt>
                  <dd className="break-all">
                    <a className="link" href={`mailto:${panel.assist.mission.clientEmail}`}>
                      {panel.assist.mission.clientEmail}
                    </a>
                  </dd>
                </>
              ) : null}
              {canPmr && panel.assist.mission ? (
                <>
                  {panel.assist.mission.clientLang ? (
                    <>
                      <dt className="text-small text-fg-muted">Langue</dt>
                      <dd>{panel.assist.mission.clientLang}</dd>
                    </>
                  ) : null}
                  {panel.assist.mission.clientDesc ? (
                    <>
                      <dt className="text-small text-fg-muted">Précisions</dt>
                      <dd className="whitespace-pre-line">{panel.assist.mission.clientDesc}</dd>
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

/** Bouts d'assistance des trajets affichés (annulés exclus ; avec un filtre district, ses gares seulement). */
function aleaEnds(rows: Assist[], district: string): AleaEnd[] {
  const ends: AleaEnd[] = [];
  for (const a of rows) {
    if (a.status === "annulee") continue;
    const l = legOf(a);
    const train = a.transport === "taxi" ? `Taxi${a.train ? ` ${a.train}` : ""}` : a.train || "—";
    const base = {
      day: a.day,
      train,
      pax: a.pax,
      pmrType: a.pmrType,
      dossier: a.dicosRef,
      fullPax: a.fullPax,
      lightPax: a.lightPax,
    };
    if (l.inA && (!district || l.depDistrict === district))
      ends.push({ ...base, station: l.dep, time: l.depTime, io: "IN" });
    if (l.outA && (!district || l.arrDistrict === district))
      ends.push({ ...base, station: l.arr, time: l.arrTime, io: "OUT" });
  }
  return ends;
}

/**
 * « Export ALEA » (demande du 9 oct. 2026) : par train et par gare, les PMR additionnées par sens et type précis,
 * une ligne par combinaison (« Embarquement de trois non-voyants »), à copier bloc par bloc ou en entier.
 */
function AleaExport({ rows, district }: { rows: Assist[]; district: string }) {
  return (
    <AleaButton
      disabled={!rows.length}
      eyebrow="// Missions PMR"
      description={`Par train, gare et sens : les PMR de tous les dossiers additionnées par type${district ? ` (district ${district})` : ""}. Missions annulées exclues.`}
      compute={() => aleaGroups(aleaEnds(rows, district))}
    />
  );
}
