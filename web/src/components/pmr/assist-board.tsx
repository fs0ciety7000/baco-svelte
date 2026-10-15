"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn, pl } from "@/lib/utils";
import { loadAssistPanel } from "@/app/(app)/pmr/actions";
import { Timeline } from "@/components/ui/form-kit";
import { LiveHighlight } from "@/components/ui/live-highlight";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/status-badge";
import { ScrollTable } from "@/components/ui/scroll-table";
import { Td, Th, THead, Tr } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { safeCall } from "@/lib/orders/safe-call";
import { formatDay, pbDate } from "@/lib/orders/time";
import { inDistricts, districtsLabel } from "@/lib/pmr/district-filter";
import { DISTRICT_LABEL } from "@/lib/pmr/districts";

import {
  aleaGroupBlocks,
  aleaGroups,
  ASSIST_STATUS,
  assistCopyText,
  DIRECTION_IO,
  DIRECTION_LABEL,
  mergeAleaBlocks,
  PMR_TYPE_LABEL,
  type AssistStatus,
} from "@/lib/pmr/model";
import { aleaEnds, groupEnds, legOf, type Leg } from "@/lib/pmr/legs";
import { dayPhase, indexAtMinute, nowSplit } from "@/lib/pmr/now-line";
import { missionImpact, type TrainStates } from "@/lib/pmr/train-delay";
import type { GroupMission } from "@/server/data/groups";
import type { Assist, PmrEvent } from "@/server/data/pmr";

import { AleaButton } from "./alea-export";
import { DayStrip, NextBadge, NowLine, scrollToMission, useNowMinute } from "./day-progress";
import { CopyButton } from "./copy";
import { PhoneLink } from "./phone-link";
import { AbsentBadge } from "./absent-badge";
import { TrainChip } from "@/components/ui/train-chip";

import { DelayBadge } from "./train-chip";

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
export type { Leg };

/** Bouts d'assistance retenus : ceux du district filtré s'il y en a un, sinon tous. */
function assistedEnds(l: Leg, district: string): ("depart" | "arrivee")[] {
  const all: ("depart" | "arrivee")[] = [];
  if (l.inA) all.push("depart");
  if (l.outA) all.push("arrivee");
  if (!district) return all;
  const inDistrict = all.filter((e) =>
    inDistricts(e === "depart" ? l.depDistrict : l.arrDistrict, district),
  );
  return inDistrict.length ? inDistrict : all;
}

/** « IN · Embarquement » / « OUT · Débarquement », ou « » si sens inconnu. */
function ioLabel(direction: string): string {
  const io = DIRECTION_IO[direction];
  return io ? `${io.io} · ${io.label}` : "";
}

export const HIGHLIGHT =
  "rounded-[min(var(--r-control),4px)] bg-[color-mix(in_oklab,var(--fg)_12%,transparent)] px-1 font-semibold text-fg";

/** Trajet : « 06:02 GARE A → 06:55 GARE B ». Gare d'assistance soulignée ; gare du district filtré surlignée. */
function RouteText({ a, district, barred }: { a: Assist; district: string; barred?: boolean }) {
  const l = legOf(a);
  const end = (name: string, time: string, assisted: boolean, d: string) => (
    // Gare assistée toujours surlignée (IN → départ, OUT → arrivée) ; avec un filtre district, seulement celles du
    // district (retour utilisateur du 9 oct. 2026).
    <span className={assisted && inDistricts(d, district) ? HIGHLIGHT : ""}>
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

/** Puce de sens (IN / OUT) d'une gare assistée : encre inversée, verte et cochée une fois validée dans DICOS. */
export function SensChip({ io, done, dim }: { io: "IN" | "OUT"; done?: boolean; dim?: boolean }) {
  return (
    <span
      data-slot="sens"
      title={`${io === "IN" ? "Embarquement (gare de départ)" : "Débarquement (gare d'arrivée)"}${done ? " : validé dans DICOS" : ""}`}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-0.5 rounded-[min(var(--r-control),4px)] px-1.5 text-label font-semibold tracking-[0.02em]",
        done
          ? "bg-[color-mix(in_oklab,var(--ok)_var(--tint,12%),var(--surface))] text-ok"
          : "bg-fg text-bg",
        dim && "opacity-60",
      )}
    >
      {done ? <Check aria-hidden className="size-3" strokeWidth={3} /> : null}
      {io}
      {done ? <span className="sr-only"> validé</span> : null}
    </span>
  );
}

/**
 * Cellule de gare (Missions PMR, Groupes ; v4 lot 4) : heure, nom, puce de sens si la gare est assistée, district en
 * dessous. Gare assistée en gras (estompée si elle sort du district filtré), gare simplement traversée en texte atténué.
 */
export function StationCell({
  name,
  time,
  district,
  filter,
  io,
  assisted,
  done,
  barred,
  next,
}: {
  name: string;
  time: React.ReactNode;
  district: string;
  filter: string;
  io: "IN" | "OUT";
  assisted: boolean;
  done?: boolean;
  barred?: boolean;
  next?: boolean;
}) {
  const mine = inDistricts(district, filter);
  return (
    <span className={cn("flex min-w-0 flex-col leading-tight", barred && "text-fg-subtle")}>
      <span className="inline-flex min-w-0 items-center gap-1.5">
        {time ? (
          <span className="shrink-0 font-mono text-small font-medium tabular text-fg-muted">
            {time}
          </span>
        ) : null}
        <span
          className={cn(
            "truncate",
            barred && "line-through",
            assisted && mine && !barred
              ? "font-semibold text-fg"
              : assisted
                ? "font-medium"
                : "text-fg-muted",
          )}
        >
          {name || "—"}
        </span>
        {assisted ? <SensChip io={io} done={done} dim={!mine} /> : null}
        {next ? <NextBadge /> : null}
      </span>
      <span className="text-label text-fg-subtle">{district || "hors"}</span>
    </span>
  );
}

/** Ligne de gare d'une carte mobile : heure à gauche, nom + sens. */
export function CardStation({
  time,
  name,
  io,
  assisted,
  done,
  strong,
  barred,
}: {
  time: string;
  name: string;
  io: "IN" | "OUT";
  assisted: boolean;
  done?: boolean;
  strong: boolean;
  barred: boolean;
}) {
  return (
    <>
      <span className="font-mono text-small font-medium text-fg-muted tabular">
        {time || "--:--"}
      </span>
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span
          className={cn(
            "truncate",
            barred && "line-through",
            strong && !barred
              ? "font-semibold text-fg"
              : assisted
                ? "font-medium"
                : "text-fg-muted",
          )}
        >
          {name || "—"}
        </span>
        {assisted ? <SensChip io={io} done={done} dim={!strong} /> : null}
      </span>
    </>
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
  now,
  today,
  neverSynced = false,
}: {
  rows: Assist[];
  /** Minute courante (Bruxelles) au rendu serveur et jour courant : repère « maintenant » et mini-frise (15 oct. 2026). */
  now?: number;
  today?: string;
  /** Aucune synchro DICOS n'a jamais eu lieu : état vide de première utilisation. */
  neverSynced?: boolean;
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
  const nowMin = useNowMinute(now ?? 0);
  const timed = now !== undefined && !!today && groupByDay;

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
    return neverSynced ? (
      <EmptyState
        variant="first"
        title="Jamais synchronisé avec DICOS"
        description="Installe l'extension CSM puis lance la synchro depuis l'onglet DICOS ouvert : les missions arrivent ici."
        action={
          <Link href="/extension" className="link">
            Extension CSM
          </Link>
        }
      />
    ) : notSynced ? (
      <EmptyState
        framed
        title="Pas encore synchronisé"
        description="Aucune synchro DICOS pour cette période : lance la synchro depuis l'extension (onglet DICOS ouvert)."
        action={
          <Link href="/extension" className="link text-small">
            Extension CSM
          </Link>
        }
      />
    ) : (
      <EmptyState
        framed
        title="Aucune mission"
        description="Aucune mission PMR pour ces filtres."
      />
    );

  const days = groupByDay ? [...new Set(rows.map((r) => r.day))] : [""];
  // Repère « maintenant » (15 oct. 2026) : prises en charge du jour (IN au départ, OUT à l'arrivée) pour la mini-frise.
  const todayRows = timed ? rows.filter((r) => r.day === today) : [];
  const pickups = todayRows
    .filter((a) => a.status !== "annulee")
    .flatMap((a) => {
      const l = legOf(a);
      const t = [l.inA ? a.time : "", l.outA ? a.arrTime || a.time : ""].filter(Boolean);
      return t.length ? t : [a.time];
    });
  const nowItem = (a: Assist) => ({
    start: a.time,
    end: (legOf(a).outA && a.arrTime) || undefined,
  });
  const todaySplit = nowSplit(todayRows.map(nowItem), nowMin, "today");

  return (
    <>
      <LiveHighlight
        scope="assists"
        context={`${district}|${rows[0]?.day ?? ""}|${rows.at(-1)?.day ?? ""}`}
        sigs={Object.fromEntries(rows.map((r) => [r.id, `${r.status}|${r.updated}`]))}
      />
      {todayRows.length ? (
        <DayStrip
          times={pickups}
          now={nowMin}
          done={todaySplit.past.filter(Boolean).length}
          total={todayRows.length}
          onPick={(minute) => {
            if (minute === null) return scrollToMission(null);
            const i = indexAtMinute(
              todayRows.map((a) => a.time),
              minute,
            );
            scrollToMission(todayRows[i]?.id ?? null);
          }}
        />
      ) : null}
      {days.map((d) => {
        const list = d ? rows.filter((r) => r.day === d) : rows;
        const split =
          timed && d
            ? nowSplit(list.map(nowItem), nowMin, dayPhase(d, today!))
            : { insertAt: -1, next: -1, past: list.map(() => false) };
        const nextTime = split.next >= 0 ? (list[split.next]?.time ?? "") : "";
        const nowLine = (variant: "row" | "card") =>
          split.insertAt >= 0 ? (
            <NowLine
              key="maintenant"
              now={nowMin}
              nextTime={nextTime}
              index={split.insertAt}
              variant={variant}
              colSpan={groupByDay ? 8 : 9}
            />
          ) : null;
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
              {/* v4 lot 4 : sens IN / OUT dans la cellule de gare (puce si assisté), gare assistée en gras, retard
                  collé au train. Défilement horizontal propre : train et « Copier » collants, en-tête collé, Réf. DICOS
                  masquée quand la place manque (elle reste dans le panneau de la mission). */}
              <ScrollTable
                label={d ? `Missions PMR du ${formatDay(d)}` : "Missions PMR"}
                stickyFirst
                stickyLast
                data-testid="assists-scroll"
              >
                <THead>
                  <tr>
                    <Th>Train</Th>
                    {!groupByDay ? <Th>Date</Th> : null}
                    <Th>Départ · IN</Th>
                    <Th>Arrivée · OUT</Th>
                    <Th>Assistance</Th>
                    <Th numeric>Pax</Th>
                    <Th className="hidden @7xl:table-cell">Réf. DICOS</Th>
                    <Th>Statut</Th>
                    <Th>Copier</Th>
                  </tr>
                </THead>
                <tbody data-testid="assists-table" data-hl-scope="assists">
                  {list.map((a, i) => {
                    const l = legOf(a);
                    const barred = a.status === "annulee";
                    return [
                      i === split.insertAt ? nowLine("row") : null,
                      <Tr
                        key={a.id}
                        data-hl={a.id}
                        data-past={split.past[i] || undefined}
                        data-next={i === split.next || undefined}
                        selected={open?.id === a.id}
                        statusColor={toneVar[ASSIST_STATUS[a.status].tone]}
                        className={cn(
                          "cursor-pointer",
                          // Mission passée estompée (fond des cellules gardé opaque : colonnes collantes).
                          split.past[i] &&
                            open?.id !== a.id &&
                            "[&>td]:text-fg-muted [&>td>*]:opacity-60",
                        )}
                        onClick={() => show(a)}
                      >
                        <Td>
                          <span className="inline-flex items-center gap-1.5">
                            <TrainChip train={a.train} taxi={a.transport === "taxi"} />
                            <DelayBadge impact={missionImpact(a, delays)} />
                          </span>
                        </Td>
                        {!groupByDay ? (
                          <Td className="font-mono whitespace-nowrap tabular">
                            {formatDay(a.day)}
                          </Td>
                        ) : null}
                        <Td className="min-w-44">
                          <StationCell
                            name={l.dep}
                            district={l.depDistrict}
                            filter={district}
                            io="IN"
                            assisted={l.inA}
                            done={l.inDone}
                            barred={barred}
                            time={
                              <button
                                type="button"
                                className="cursor-pointer rounded-[min(var(--r-control),4px)] focus-visible:outline-1 focus-visible:outline-accent"
                                aria-label={`Ouvrir la mission de ${a.time || "—"} à ${a.station}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  show(a);
                                }}
                              >
                                {a.time || "--:--"}
                              </button>
                            }
                            next={i === split.next}
                          />
                        </Td>
                        <Td className="min-w-44">
                          <StationCell
                            name={l.arr}
                            district={l.arrDistrict}
                            filter={district}
                            io="OUT"
                            assisted={l.outA}
                            done={l.outDone}
                            barred={barred}
                            time={l.arrTime || ""}
                          />
                        </Td>
                        <Td className="max-w-48 min-w-32">
                          <span className="block truncate" title={a.pmrType || undefined}>
                            {a.pmrType ? (PMR_TYPE_LABEL[a.pmrType] ?? a.pmrType) : "type ?"}
                          </span>
                          {canPmr && a.clientName ? (
                            <span className="block truncate text-small text-fg-muted">
                              {a.clientName}
                            </span>
                          ) : null}
                        </Td>
                        <Td numeric>{a.pax}</Td>
                        <Td className="hidden font-mono text-small whitespace-nowrap text-fg-muted @7xl:table-cell">
                          {a.dicosRef || "—"}
                        </Td>
                        <Td>
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <AssistBadge status={a.status} />
                            {a.absent ? <AbsentBadge /> : null}
                          </span>
                        </Td>
                        <Td>
                          <CopyButton text={copyTextOf(a, district)} />
                        </Td>
                      </Tr>,
                    ];
                  })}
                  {split.insertAt === list.length ? nowLine("row") : null}
                </tbody>
              </ScrollTable>
            </div>
            <ul
              className="flex flex-col gap-2 md:hidden"
              data-testid="assists-cards"
              data-hl-scope="assists"
            >
              {list.map((a, i) => {
                const l = legOf(a);
                const barred = a.status === "annulee";
                return [
                  i === split.insertAt ? nowLine("card") : null,
                  // Carte mobile (v4) : train + retard + statut, puis les deux gares (heure, nom, sens), détails, Copier.
                  <li
                    key={a.id}
                    className={cn(
                      "relative min-w-0",
                      split.past[i] && "opacity-60",
                      i === split.next && "[&>button]:ring-1 [&>button]:ring-info",
                    )}
                    data-past={split.past[i] || undefined}
                    data-next={i === split.next || undefined}
                  >
                    <button
                      type="button"
                      data-hl={a.id}
                      style={
                        { "--status": toneVar[ASSIST_STATUS[a.status].tone] } as React.CSSProperties
                      }
                      className="flex w-full min-w-0 cursor-pointer flex-col gap-2 rounded-box border border-(--card-frame) bg-surface px-3 py-2.5 text-left shadow-[inset_3px_0_0_var(--status)]"
                      onClick={() => show(a)}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <TrainChip train={a.train} taxi={a.transport === "taxi"} />
                        <DelayBadge impact={missionImpact(a, delays)} />
                        {a.absent ? <AbsentBadge /> : null}
                        {i === split.next ? <NextBadge /> : null}
                        <span className="ml-auto shrink-0">
                          <AssistBadge status={a.status} />
                        </span>
                      </span>
                      <span className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-body">
                        <CardStation
                          time={a.time}
                          name={l.dep}
                          io="IN"
                          assisted={l.inA}
                          done={l.inDone}
                          strong={l.inA && inDistricts(l.depDistrict, district)}
                          barred={barred}
                        />
                        <CardStation
                          time={l.arrTime}
                          name={l.arr}
                          io="OUT"
                          assisted={l.outA}
                          done={l.outDone}
                          strong={l.outA && inDistricts(l.arrDistrict, district)}
                          barred={barred}
                        />
                      </span>
                      <span className="pr-12 text-small text-fg-muted">
                        {[
                          !groupByDay ? formatDay(a.day) : "",
                          a.pmrType ? (PMR_TYPE_LABEL[a.pmrType] ?? a.pmrType) : "type ?",
                          `${a.pax} pers.`,
                          a.dicosRef ? `dossier ${a.dicosRef}` : "",
                          canPmr && a.clientName ? a.clientName : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </button>
                    <span className="absolute right-2 bottom-2">
                      <CopyButton text={copyTextOf(a, district)} />
                    </span>
                  </li>,
                ];
              })}
              {split.insertAt === list.length ? nowLine("card") : null}
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
        eyebrow={open ? `Mission PMR · ${formatDay(open.day)}` : undefined}
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

/**
 * Boutons ALEA des Missions PMR (barre d'outils, v4 lot 4) : « Export ALEA » (demande du 9 oct. 2026 : par train et par
 * gare, les PMR additionnées par sens et type précis, à copier bloc par bloc ou en entier) et, avec les groupes de la
 * période, « ALEA PMR + groupes » (10 oct. 2026).
 */
export function AssistAlea({
  rows,
  groups,
  district = "",
  canMark,
}: {
  rows: Assist[];
  groups?: GroupMission[];
  district?: string;
  canMark: boolean;
}) {
  return (
    <>
      {groups?.length ? (
        <AleaButton
          kind="commun"
          label="ALEA PMR + groupes"
          canMark={canMark}
          disabled={!rows.length && !groups.length}
          eyebrow="Missions PMR et groupes"
          description={`Un bloc par train, gare et sens : PMR et groupes réunis${district ? ` (district ${districtsLabel(district)})` : ""}, la règle la plus exigeante décide. Missions annulées exclues.`}
          compute={() =>
            mergeAleaBlocks(
              aleaGroups(aleaEnds(rows, district)),
              aleaGroupBlocks(groupEnds(groups, district)),
            )
          }
        />
      ) : null}
      <AleaButton
        kind="pmr"
        canMark={canMark}
        disabled={!rows.length}
        eyebrow="Missions PMR"
        description={`Par train, gare et sens : les PMR de tous les dossiers additionnées par type${district ? ` (district ${districtsLabel(district)})` : ""}. Missions annulées exclues.`}
        compute={() => aleaGroups(aleaEnds(rows, district))}
      />
    </>
  );
}
