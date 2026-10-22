"use client";

import { useState } from "react";

import { cn, pl } from "@/lib/utils";
import { LiveHighlight } from "@/components/ui/live-highlight";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/status-badge";
import { ScrollTable } from "@/components/ui/scroll-table";
import { Td, Th, THead, Tr } from "@/components/ui/table";
import { formatDay } from "@/lib/orders/time";
import { inDistricts, districtsLabel } from "@/lib/pmr/district-filter";
import { DISTRICT_LABEL } from "@/lib/pmr/districts";
import { aleaGroupBlocks } from "@/lib/pmr/model";
import { groupEnds, groupLegOf, groupTotal, groupTrain } from "@/lib/pmr/legs";
import { dayPhase, indexAtMinute, nowSplit } from "@/lib/pmr/now-line";
import { missionImpact, type TrainStates } from "@/lib/pmr/train-delay";
import type { GroupMission } from "@/server/data/groups";

import { AleaButton } from "./alea-export";
import { DayStrip, NextBadge, NowLine, scrollToMission, useNowMinute } from "./day-progress";
import { CardStation, StationCell } from "./assist-board";
import { PhoneLink } from "./phone-link";
import { AbsentBadge } from "./absent-badge";
import { TrainChip } from "@/components/ui/train-chip";

import { DelayBadge } from "./train-chip";

// Missions de GROUPE DICOS (lecture seule, demande du 9 oct. 2026) : même présentation que les missions PMR
// (trajet, IN/OUT, district, gare assistée surlignée), avec le nom du groupe et ses comptages.

const STATUS = {
  prevue: { label: "Prévue", tone: "info" },
  realisee: { label: "Réalisée", tone: "ok" },
  annulee: { label: "Annulée", tone: "danger" },
} as const;
const STATUS_TONE = { info: "var(--info)", ok: "var(--ok)", danger: "var(--danger)" } as const;

const legOf = groupLegOf;
const trainOf = groupTrain;
const total = groupTotal;

/** Trajet en texte (panneau) : « 20:16 Mons → 20:41 Quiévrain ». */
function Route({ g }: { g: GroupMission }) {
  const l = legOf(g);
  return (
    <span className={g.status === "annulee" ? "line-through" : ""}>
      {l.depTime ? <span className="font-mono tabular text-fg-muted">{l.depTime} </span> : null}
      <span className={l.inA ? "font-medium text-fg" : ""}>{l.dep}</span>{" "}
      <span className="text-fg-muted">→</span>{" "}
      {l.arrTime ? <span className="font-mono tabular text-fg-muted">{l.arrTime} </span> : null}
      <span className={l.outA ? "font-medium text-fg" : ""}>{l.arr}</span>
    </span>
  );
}

/** Bouton « Export ALEA » des Groupes (barre d'outils, v4 lot 4). */
export function GroupAlea({
  rows,
  district = "",
  canMark,
  days,
}: {
  rows: GroupMission[];
  district?: string;
  canMark: boolean;
  /** Choix du jour dans la fenêtre ALEA (22 oct. 2026). */
  days?: { list: string | null; today: string };
}) {
  return (
    <AleaButton
      kind="groupe"
      pickDay={days ? { listDay: days.list, today: days.today, district } : undefined}
      canMark={canMark}
      disabled={!rows.length}
      eyebrow="Groupes"
      description={`Par train et par gare, une ligne par groupe${district ? ` (district ${districtsLabel(district)})` : ""}. Missions annulées exclues.`}
      compute={() => aleaGroupBlocks(groupEnds(rows, district))}
    />
  );
}

export function GroupBoard({
  rows,
  district = "",
  delays,
  now,
  today,
}: {
  rows: GroupMission[];
  /** Minute courante (Bruxelles) au rendu serveur et jour courant : repère « maintenant » et mini-frise (15 oct. 2026). */
  now?: number;
  today?: string;
  district?: string;
  /** États iRail des trains du jour : badge de retard à la gare assistée. */
  delays?: TrainStates;
}) {
  const [open, setOpen] = useState<GroupMission | null>(null);
  const days = [...new Set(rows.map((r) => r.day))];
  const nowMin = useNowMinute(now ?? 0);
  const timed = now !== undefined && !!today;
  const startOf = (g: GroupMission) => g.time || g.arrTime;
  const nowItem = (g: GroupMission) => ({
    start: startOf(g),
    end: (legOf(g).outA && g.arrTime) || undefined,
  });
  const todayRows = timed ? rows.filter((r) => r.day === today) : [];
  const pickups = todayRows
    .filter((g) => g.status !== "annulee")
    .flatMap((g) => {
      const l = legOf(g);
      const t = [l.inA ? g.time : "", l.outA ? g.arrTime : ""].filter(Boolean);
      return t.length ? t : [startOf(g)];
    });
  const todaySplit = nowSplit(todayRows.map(nowItem), nowMin, "today");
  return (
    <>
      <LiveHighlight
        scope="groups"
        context={`${district}|${days[0] ?? ""}|${days.at(-1) ?? ""}`}
        sigs={Object.fromEntries(
          rows.map((r) => [r.id, `${r.status}|${r.time}|${r.arrTime}|${total(r)}`]),
        )}
      />
      {todayRows.length ? (
        <DayStrip
          times={pickups}
          now={nowMin}
          done={todaySplit.past.filter(Boolean).length}
          total={todayRows.length}
          onPick={(minute) => {
            if (minute === null) return scrollToMission(null);
            const i = indexAtMinute(todayRows.map(startOf), minute);
            scrollToMission(todayRows[i]?.id ?? null);
          }}
        />
      ) : null}
      {days.map((d) => {
        const list = rows.filter((r) => r.day === d);
        const split = timed
          ? nowSplit(list.map(nowItem), nowMin, dayPhase(d, today!))
          : { insertAt: -1, next: -1, past: list.map(() => false) };
        const nextTime = split.next >= 0 && list[split.next] ? startOf(list[split.next]!) : "";
        const nowLine = (variant: "row" | "card") =>
          split.insertAt >= 0 ? (
            <NowLine
              key="maintenant"
              now={nowMin}
              nextTime={nextTime}
              index={split.insertAt}
              variant={variant}
              colSpan={8}
            />
          ) : null;
        return (
          <section key={d} className="flex flex-col gap-2" aria-label={formatDay(d)}>
            <h2 className="label-mono text-fg-muted first-letter:uppercase">
              {formatDay(d)} · {list.length} {pl(list.length, "trajet")}
            </h2>
            <div className="hidden md:block">
              {/* Défilement horizontal propre (15 oct. 2026) : train collant, en-tête collé ; v4 lot 4 : sens dans la
                  cellule de gare, gare assistée en gras. */}
              <ScrollTable
                label={`Groupes du ${formatDay(d)}`}
                stickyFirst
                data-testid="groups-scroll"
              >
                <THead>
                  <tr>
                    <Th>Train</Th>
                    <Th>Départ · IN</Th>
                    <Th>Arrivée · OUT</Th>
                    <Th>Groupe</Th>
                    <Th numeric>Adultes</Th>
                    <Th numeric>Enfants</Th>
                    <Th numeric>Seniors</Th>
                    <Th>Statut</Th>
                  </tr>
                </THead>
                <tbody data-testid="groups-table" data-hl-scope="groups">
                  {list.map((g, i) => {
                    const l = legOf(g);
                    const barred = g.status === "annulee";
                    return [
                      i === split.insertAt ? nowLine("row") : null,
                      <Tr
                        key={g.id}
                        data-hl={g.id}
                        data-past={split.past[i] || undefined}
                        data-next={i === split.next || undefined}
                        selected={open?.id === g.id}
                        statusColor={STATUS_TONE[STATUS[g.status].tone]}
                        className={cn(
                          "cursor-pointer",
                          split.past[i] &&
                            open?.id !== g.id &&
                            "[&>td]:text-fg-muted [&>td>*]:opacity-60",
                        )}
                        onClick={() => setOpen(g)}
                      >
                        <Td>
                          <span className="inline-flex items-center gap-1.5">
                            <TrainChip train={g.train} taxi={g.transport === "taxi"} />
                            <DelayBadge impact={missionImpact(g, delays)} />
                          </span>
                        </Td>
                        <Td className="min-w-44">
                          <StationCell
                            name={l.dep}
                            time={l.depTime}
                            district={l.depDistrict}
                            filter={district}
                            io="IN"
                            assisted={l.inA}
                            done={l.inDone}
                            barred={barred}
                            next={i === split.next}
                          />
                        </Td>
                        <Td className="min-w-44">
                          <StationCell
                            name={l.arr}
                            time={l.arrTime}
                            district={l.arrDistrict}
                            filter={district}
                            io="OUT"
                            assisted={l.outA}
                            done={l.outDone}
                            barred={barred}
                          />
                        </Td>
                        <Td className="max-w-56 truncate">
                          <button
                            type="button"
                            className="cursor-pointer text-left link"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpen(g);
                            }}
                          >
                            {g.groupName || "Groupe"}
                          </button>
                        </Td>
                        <Td numeric>{g.adults}</Td>
                        <Td numeric>{g.children}</Td>
                        <Td numeric>{g.seniors}</Td>
                        <Td>
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <Badge tone={STATUS[g.status].tone}>{STATUS[g.status].label}</Badge>
                            {g.absent ? <AbsentBadge /> : null}
                          </span>
                        </Td>
                      </Tr>,
                    ];
                  })}
                  {split.insertAt === list.length ? nowLine("row") : null}
                </tbody>
              </ScrollTable>
            </div>
            <ul className="flex flex-col gap-2 md:hidden" data-hl-scope="groups">
              {list.map((g, i) => {
                const l = legOf(g);
                const barred = g.status === "annulee";
                return [
                  i === split.insertAt ? nowLine("card") : null,
                  <li
                    key={g.id}
                    className={cn(
                      "min-w-0",
                      split.past[i] && "opacity-60",
                      i === split.next && "[&_[data-hl]]:ring-1 [&_[data-hl]]:ring-info",
                    )}
                    data-past={split.past[i] || undefined}
                    data-next={i === split.next || undefined}
                  >
                    <button
                      type="button"
                      data-hl={g.id}
                      style={
                        { "--status": STATUS_TONE[STATUS[g.status].tone] } as React.CSSProperties
                      }
                      className="flex w-full min-w-0 cursor-pointer flex-col gap-2 rounded-box border border-(--card-frame) bg-surface px-3 py-2.5 text-left shadow-[inset_3px_0_0_var(--status)]"
                      onClick={() => setOpen(g)}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <TrainChip train={g.train} taxi={g.transport === "taxi"} />
                        <DelayBadge impact={missionImpact(g, delays)} />
                        {g.absent ? <AbsentBadge /> : null}
                        {i === split.next ? <NextBadge /> : null}
                        <span className="ml-auto shrink-0">
                          <Badge tone={STATUS[g.status].tone}>{STATUS[g.status].label}</Badge>
                        </span>
                      </span>
                      <span className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-body">
                        <CardStation
                          time={l.depTime}
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
                      <span className="text-small text-fg-muted">
                        {`${g.groupName || "Groupe"} · ${total(g)} pers.${g.children ? ` dont ${g.children} enfants` : ""}`}
                      </span>
                    </button>
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
        onOpenChange={(o) => !o && setOpen(null)}
        title={open ? open.groupName || "Groupe" : ""}
        description={open ? `${formatDay(open.day)} · ${trainOf(open)}` : ""}
      >
        {open ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
            <dt className="text-small text-fg-muted">Trajet</dt>
            <dd>
              <Route g={open} />
            </dd>
            <dt className="text-small text-fg-muted">Assistance</dt>
            <dd>
              {[
                open.inAssist ? `IN · embarquement à ${open.station}` : "",
                open.outAssist ? `OUT · débarquement à ${open.otherStation}` : "",
              ]
                .filter(Boolean)
                .join(" ; ") || "—"}
            </dd>
            <dt className="text-small text-fg-muted">District</dt>
            <dd>
              {[open.district, open.arrDistrict]
                .filter(Boolean)
                .map((d) => `${d} · ${DISTRICT_LABEL[d as keyof typeof DISTRICT_LABEL] ?? ""}`)
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(" → ") || "—"}
            </dd>
            <dt className="text-small text-fg-muted">Composition</dt>
            <dd>
              {total(open)} {pl(total(open), "personne")} : {open.adults}{" "}
              {pl(open.adults, "adulte")}, {open.children} {pl(open.children, "enfant")},{" "}
              {open.seniors} {pl(open.seniors, "senior")}
            </dd>
            {open.coach ? (
              <>
                <dt className="text-small text-fg-muted">Voiture</dt>
                <dd>{open.coach}</dd>
              </>
            ) : null}
            {open.meetingPoint ? (
              <>
                <dt className="text-small text-fg-muted">Point de rencontre</dt>
                <dd>{open.meetingPoint}</dd>
              </>
            ) : null}
            <dt className="text-small text-fg-muted">Réf. DICOS</dt>
            <dd className="font-mono">{open.dicosRef || "—"}</dd>
            <dt className="text-small text-fg-muted">Contact</dt>
            <dd>{open.contactName || "—"}</dd>
            {open.contactPhone ? (
              <>
                <dt className="text-small text-fg-muted">Téléphone</dt>
                <dd>
                  <PhoneLink phone={open.contactPhone} />
                </dd>
              </>
            ) : null}
            {open.contactEmail ? (
              <>
                <dt className="text-small text-fg-muted">E-mail</dt>
                <dd className="break-all">
                  <a className="link" href={`mailto:${open.contactEmail}`}>
                    {open.contactEmail}
                  </a>
                </dd>
              </>
            ) : null}
          </dl>
        ) : null}
      </Sheet>
    </>
  );
}
