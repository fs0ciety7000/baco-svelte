"use client";

import { Car, Store, TrainFront } from "lucide-react";
import * as React from "react";

import {
  bcsLoad,
  hhmm,
  isCancelled,
  isPmr,
  stationKey,
  type AgentTimeline,
  type BcsCounter,
  type CheckResult,
  type PlannerAgent,
  type PlannerAssignee,
  type PlannerContext,
  type PlannerTask,
} from "@/lib/planner";
import type { ServerAgent } from "@/lib/planner/adapt";
import {
  bcsOpen,
  blockLabel,
  hourTicks,
  isPending,
  rowBlocks,
  taskName,
  xOf,
  type AgentGroup,
  type Block,
  type DayBounds,
} from "@/lib/planner/board";
import { cn, pl } from "@/lib/utils";

import { TONED, toneStyle } from "./task-visuals";

// Vue Jour en Gantt (desktop) : une rangée par agent (groupée par base puis poste), guichets B-CS, taxi et chef de bord ;
// le temps en horizontal, défilement DANS le cadre (jamais la page), colonne des noms et axe collants.

export const HEADER_W = 240;
const LANE = 44;
const PAD = 8;
const HOUR = 3_600_000;

export type DragInfo = { verdicts: Map<string, CheckResult>; over: string | null };

export type GanttProps = {
  ctx: PlannerContext;
  groups: AgentGroup[];
  serverAgents: Map<string, ServerAgent>;
  bounds: DayBounds;
  px: number;
  now: number | null;
  day: string;
  timelines: Map<string, AgentTimeline>;
  conflicts: Map<string, CheckResult>;
  duplicates: Set<string>;
  proposals: Map<string, PlannerAssignee>;
  bcs: BcsCounter[];
  drag: DragInfo | null;
  selectedId: string | null;
  showAgent: (a: PlannerAgent) => boolean;
  onOpen: (id: string) => void;
  onDragStart: (e: React.PointerEvent, ids: string[], label: string) => void;
  canWrite: boolean;
  scrollerRef: React.RefObject<HTMLDivElement | null>;
};

export function durationLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

const ms = (iso: string) => Date.parse(iso);

export function DayGantt(p: GanttProps) {
  const W = Math.max(0, xOf(p.bounds.end, p.bounds, p.px));
  const ticks = hourTicks(p.bounds);
  const nowX =
    p.now !== null && p.now >= p.bounds.start && p.now <= p.bounds.end
      ? xOf(p.now, p.bounds, p.px)
      : null;
  const byAgent = React.useMemo(() => {
    const m = new Map<string, PlannerTask[]>();
    for (const t of p.ctx.tasks) {
      if (t.assignee?.kind !== "agent" || !t.assignee.agentId) continue;
      const list = m.get(t.assignee.agentId) ?? [];
      list.push(t);
      m.set(t.assignee.agentId, list);
    }
    return m;
  }, [p.ctx.tasks]);
  const proposed = React.useMemo(() => {
    const m = new Map<string, PlannerTask[]>();
    for (const [id, target] of p.proposals) {
      const t = p.ctx.tasks.find((x) => x.id === id);
      if (!t) continue;
      const key = rowKeyOf(target, t);
      const list = m.get(key) ?? [];
      list.push({ ...t, assignee: target });
      m.set(key, list);
    }
    return m;
  }, [p.proposals, p.ctx.tasks]);
  const others = React.useMemo(() => {
    const m = new Map<string, PlannerTask[]>();
    for (const t of p.ctx.tasks) {
      if (!t.assignee || t.assignee.kind === "agent") continue;
      const key = rowKeyOf(t.assignee, t);
      const list = m.get(key) ?? [];
      list.push(t);
      m.set(key, list);
    }
    return m;
  }, [p.ctx.tasks]);
  const grid: React.CSSProperties = {
    width: W,
    backgroundImage:
      "linear-gradient(to right, color-mix(in oklab, var(--border) 75%, transparent) 1px, transparent 1px)",
    backgroundSize: `${p.px}px 100%`,
  };
  const visibleGroups = p.groups
    .map((g) => ({ ...g, agents: g.agents.filter(p.showAgent) }))
    .filter((g) => g.agents.length);

  return (
    <div
      ref={p.scrollerRef}
      role="region"
      aria-label="Planning du jour par agent"
      tabIndex={0}
      data-testid="planner-gantt"
      className="relative min-h-0 flex-1 overflow-auto overscroll-contain rounded-box border border-border bg-surface shadow-rest focus-visible:outline-2 focus-visible:outline-accent"
    >
      <div className="relative" style={{ width: HEADER_W + W }}>
        {/* Axe du temps (collant en haut) */}
        <div className="sticky top-0 z-30 flex h-9 border-b border-border bg-surface">
          <div
            className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border bg-surface px-3 text-label text-fg-muted"
            style={{ width: HEADER_W }}
          >
            Agents · base · poste
          </div>
          <div className="relative shrink-0" style={{ width: W }}>
            {ticks.map((t) => (
              <span
                key={t.at}
                className="absolute top-2 -translate-x-1/2 font-mono text-label text-fg-muted tabular"
                style={{ left: xOf(t.at, p.bounds, p.px) }}
              >
                {t.at === p.bounds.start ||
                (nowX !== null && Math.abs(xOf(t.at, p.bounds, p.px) - nowX) < 36)
                  ? ""
                  : t.label}
              </span>
            ))}
            {nowX !== null ? (
              <span
                className="absolute top-1.5 z-10 -translate-x-1/2 rounded-pill bg-danger px-1.5 font-mono text-label font-semibold text-bg tabular"
                style={{ left: nowX }}
                data-testid="planner-now-label"
              >
                {hhmm(p.now!)}
              </span>
            ) : null}
          </div>
        </div>

        {visibleGroups.length === 0 ? (
          <p
            className="sticky left-0 p-6 text-body text-fg-muted"
            style={{ width: "min(100%, 40rem)" }}
          >
            Aucun agent de gare en service ce jour pour ces districts (horaires Quinyx des groupes «
            gares »).
          </p>
        ) : null}

        {visibleGroups.map((g) => (
          <section
            key={g.code || "?"}
            aria-label={g.base ? `Base ${g.base.name}` : "Base inconnue"}
          >
            <GroupHeader
              title={g.base ? `${g.base.name} · ${g.base.code}` : "Base inconnue"}
              detail={`${g.agents.length} ${pl(g.agents.length, "agent")}${g.base?.covers.length ? ` · couvre ${[g.base.code, ...g.base.covers].join(" · ")}` : ""}`}
              width={W}
            />
            {g.agents.map((a) => {
              const key = `agent:${a.id}`;
              const tl = p.timelines.get(a.id);
              const sa = p.serverAgents.get(a.id);
              const shift = sa?.shifts[0];
              const tasks = byAgent.get(a.id) ?? [];
              const nConflicts = tasks.filter(
                (t) => p.conflicts.get(t.id)?.level === "block",
              ).length;
              const service = a.shifts
                .map((s) => `${hhmm(ms(s.start))}–${hhmm(ms(s.end))}`)
                .join(", ");
              return (
                <Row
                  key={a.id}
                  dropKey={key}
                  width={W}
                  grid={grid}
                  tasks={tasks}
                  proposed={proposed.get(key) ?? []}
                  label={`${a.post} · ${a.base}, ${a.name}, service ${service || "aucun"}, ${tl?.occupancy ?? 0} % occupé, ${pl(tasks.length, "tâche")}${nConflicts ? `, ${nConflicts} en conflit` : ""}`}
                  header={
                    <>
                      <p className="flex items-center gap-1.5 font-mono text-label text-fg-muted">
                        <span className="font-semibold text-fg">{a.post}</span> · {a.base}
                        {nConflicts ? (
                          <span
                            className="ml-auto font-sans font-semibold text-danger"
                            title={`${nConflicts} en conflit`}
                          >
                            {nConflicts} !
                          </span>
                        ) : null}
                      </p>
                      {shift ? (
                        <p className="truncate text-label text-fg-subtle">
                          {shift.code}
                          {shift.section ? ` · ${shift.section}` : ""}
                        </p>
                      ) : null}
                      <p className="truncate text-small font-semibold text-fg">{a.name}</p>
                      <p className="flex items-center gap-2 text-label text-fg-muted tabular">
                        <span
                          aria-hidden
                          className="relative h-1 w-8 shrink-0 overflow-hidden rounded-pill bg-surface-3"
                        >
                          <span
                            className="absolute inset-y-0 left-0 bg-fg-muted"
                            style={{ width: `${tl?.occupancy ?? 0}%` }}
                          />
                        </span>
                        <span className="truncate">
                          {service || "sans service"} · {tl?.occupancy ?? 0} % occupé
                        </span>
                      </p>
                    </>
                  }
                  background={
                    <>
                      <OffService
                        intervals={a.shifts.map((s) => ({ s: ms(s.start), e: ms(s.end) }))}
                        bounds={p.bounds}
                        px={p.px}
                      />
                      {tl?.items.map((it, i) =>
                        it.type === "trajet" ? (
                          <div
                            key={`tr${i}`}
                            className={cn(
                              "absolute top-1/2 flex h-7 -translate-y-1/2 items-center gap-1 overflow-hidden rounded-control border border-dashed bg-surface px-1.5 text-label whitespace-nowrap text-fg-muted",
                              it.conflict ? "border-danger text-danger" : "border-border-strong",
                            )}
                            style={span(it.start, it.end, p.bounds, p.px)}
                            title={`${it.label}${it.minutes !== null ? ` · ${it.minutes} min` : " · trajet inconnu"}`}
                            data-testid="planner-trajet"
                          >
                            <Car aria-hidden className="size-3.5 shrink-0" />
                            <span className="truncate">{it.label}</span>
                          </div>
                        ) : it.type === "libre" && it.minutes >= 30 ? (
                          <div
                            key={`li${i}`}
                            className="pointer-events-none absolute top-1/2 flex -translate-y-1/2 justify-center"
                            style={span(it.start, it.end, p.bounds, p.px)}
                          >
                            {(it.minutes / 60) * p.px >= 64 ? (
                              <span className="rounded-pill border border-border bg-surface px-1.5 text-label whitespace-nowrap text-fg-subtle">
                                libre {durationLabel(it.minutes)}
                              </span>
                            ) : null}
                          </div>
                        ) : null,
                      )}
                    </>
                  }
                  {...p}
                />
              );
            })}
          </section>
        ))}

        {p.bcs.length ? (
          <section aria-label="Guichets B-CS">
            <GroupHeader
              title="Guichets B-CS"
              detail={`${p.bcs.length} ${pl(p.bcs.length, "guichet")} · PMR light, capacité par heure`}
              width={W}
            />
            {p.bcs.map((c) => {
              const k = stationKey(c.station);
              const key = `bcs:${k}`;
              const open = bcsOpen(c, p.day);
              const tasks = others.get(key) ?? [];
              const nowLoad =
                p.now !== null && open
                  ? bcsLoad(c, p.ctx.tasks, new Date(p.now).toISOString())
                  : null;
              const hours: { at: number; label: string }[] = [];
              if (open)
                for (let h = Math.floor(open.start / HOUR) * HOUR; h < open.end; h += HOUR) {
                  const l = bcsLoad(c, p.ctx.tasks, new Date(h).toISOString());
                  if (l.used > 0) hours.push({ at: h, label: `${l.used}/${l.limit}` });
                }
              return (
                <Row
                  key={k}
                  dropKey={key}
                  width={W}
                  grid={grid}
                  tasks={tasks}
                  proposed={proposed.get(key) ?? []}
                  label={`Guichet B-CS ${c.station}, ${open ? `ouvert ${open.label}` : "fermé ce jour"}, ${c.perHour} PMR par heure${nowLoad ? `, ${nowLoad.label}` : ""}`}
                  header={
                    <>
                      <p className="flex items-center gap-1.5 font-mono text-label text-fg-muted">
                        <Store aria-hidden className="size-3.5" />
                        <span className="font-semibold text-fg">B-CS</span> · {c.base}
                      </p>
                      <p className="truncate text-small font-semibold text-fg">
                        Guichet B-CS · {c.station}
                      </p>
                      <p className="truncate text-label text-fg-muted tabular">
                        {open ? open.label : "Fermé ce jour"} · {c.perHour} PMR/h
                      </p>
                      {nowLoad ? (
                        <p
                          className="truncate text-label font-semibold text-fg tabular"
                          data-testid="bcs-load"
                        >
                          {nowLoad.label}
                        </p>
                      ) : null}
                    </>
                  }
                  background={
                    <>
                      <OffService
                        intervals={open ? [{ s: open.start, e: open.end }] : []}
                        bounds={p.bounds}
                        px={p.px}
                      />
                      {hours.map((h) => (
                        <span
                          key={h.at}
                          className="absolute bottom-0.5 rounded-pill bg-surface-2 px-1 font-mono text-[11px] leading-4 text-fg-muted"
                          style={{ left: xOf(h.at, p.bounds, p.px) + 4 }}
                        >
                          {h.label}
                        </span>
                      ))}
                    </>
                  }
                  {...p}
                />
              );
            })}
          </section>
        ) : null}

        <section aria-label="Autres destinations">
          <GroupHeader
            title="Autres destinations"
            detail="Taxi PMR · PMR au chef de bord"
            width={W}
          />
          {(["taxi", "cdb"] as const).map((kind) => (
            <Row
              key={kind}
              dropKey={kind}
              width={W}
              grid={grid}
              tasks={others.get(kind) ?? []}
              proposed={proposed.get(kind) ?? []}
              label={kind === "taxi" ? "Taxi PMR" : "PMR au chef de bord"}
              header={
                <>
                  <p className="flex items-center gap-1.5 font-mono text-label text-fg-muted">
                    {kind === "taxi" ? (
                      <Car aria-hidden className="size-3.5" />
                    ) : (
                      <TrainFront aria-hidden className="size-3.5" />
                    )}
                    Destination
                  </p>
                  <p className="text-small font-semibold text-fg">
                    {kind === "taxi" ? "Taxi PMR" : "Chef de bord"}
                  </p>
                </>
              }
              background={null}
              {...p}
            />
          ))}
        </section>

        {nowX !== null ? (
          <div
            aria-hidden
            className="pointer-events-none absolute top-9 bottom-0 z-20 w-0.5 bg-danger"
            style={{ left: HEADER_W + nowX - 1 }}
            data-testid="planner-now-line"
          />
        ) : null}
      </div>
    </div>
  );
}

/** Clé de rangée d'une destination : agent, guichet (gare du guichet), taxi, chef de bord. */
export function rowKeyOf(a: PlannerAssignee, t?: PlannerTask): string {
  if (a.kind === "agent") return `agent:${a.agentId ?? ""}`;
  if (a.kind === "bcs") return `bcs:${stationKey(a.label || t?.station || "")}`;
  return a.kind;
}

function span(
  start: string | number,
  end: string | number,
  b: DayBounds,
  px: number,
): React.CSSProperties {
  const s = typeof start === "number" ? start : ms(start);
  const e = typeof end === "number" ? end : ms(end);
  const left = xOf(Math.max(s, b.start), b, px);
  const right = xOf(Math.min(e, b.end), b, px);
  return { left, width: Math.max(2, right - left) };
}

function GroupHeader({ title, detail, width }: { title: string; detail: string; width: number }) {
  return (
    <div className="flex border-b border-border bg-surface-2">
      <div
        className="sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r border-border bg-surface-2 px-3 py-1.5"
        style={{ width: HEADER_W }}
      >
        <h3 className="text-small font-semibold text-fg">{title}</h3>
        <p className="truncate text-label text-fg-muted">{detail}</p>
      </div>
      <div className="shrink-0" style={{ width }} />
    </div>
  );
}

function OffService({
  intervals,
  bounds,
  px,
}: {
  intervals: { s: number; e: number }[];
  bounds: DayBounds;
  px: number;
}) {
  const sorted = intervals.filter((x) => x.e > x.s).sort((a, b) => a.s - b.s);
  const gaps: { s: number; e: number }[] = [];
  let cur = bounds.start;
  for (const iv of sorted) {
    if (iv.s > cur) gaps.push({ s: cur, e: Math.min(iv.s, bounds.end) });
    cur = Math.max(cur, iv.e);
  }
  if (cur < bounds.end) gaps.push({ s: cur, e: bounds.end });
  return (
    <>
      {gaps
        .filter((g) => g.e > g.s)
        .map((g) => (
          <div
            key={g.s}
            aria-hidden
            data-off-service
            className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--border-strong)_45%,transparent)_0_1px,transparent_1px_7px)] bg-surface-2/60"
            style={span(g.s, g.e, bounds, px)}
          />
        ))}
    </>
  );
}

type RowProps = GanttProps & {
  dropKey: string;
  width: number;
  grid: React.CSSProperties;
  tasks: PlannerTask[];
  proposed: PlannerTask[];
  label: string;
  header: React.ReactNode;
  background: React.ReactNode;
};

function Row(p: RowProps) {
  const { blocks, lanes } = rowBlocks(p.tasks);
  const prop = rowBlocks(p.proposed);
  const height = Math.max(92, PAD * 2 + Math.max(lanes, prop.lanes) * LANE);
  const verdict = p.drag?.verdicts.get(p.dropKey);
  const state = p.drag ? (verdict?.level ?? "block") : undefined;
  const over = p.drag?.over === p.dropKey;
  return (
    <div
      className={cn(
        "flex border-b border-border transition-opacity",
        state === "block" && "opacity-45",
      )}
      data-drop-key={p.dropKey}
      data-drop={state}
      data-testid="planner-row"
      title={state === "block" && verdict?.reasons[0] ? verdict.reasons[0] : undefined}
    >
      <div
        tabIndex={0}
        aria-label={p.label}
        className={cn(
          "sticky left-0 z-10 flex shrink-0 flex-col justify-center gap-0.5 overflow-hidden border-r leading-tight border-border bg-surface px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
          state === "ok" && "border-l-[3px] border-l-ok",
          state === "warn" && "border-l-[3px] border-l-warn",
        )}
        style={{ width: HEADER_W, height }}
      >
        {p.header}
      </div>
      <div
        className={cn(
          "relative shrink-0",
          state === "ok" && "bg-[color-mix(in_oklab,var(--ok)_9%,transparent)]",
          state === "warn" && "bg-[color-mix(in_oklab,var(--warn)_9%,transparent)]",
          over && state !== "block" && "outline-2 -outline-offset-2 outline-ok",
          over && state === "warn" && "outline-warn",
        )}
        style={{ ...p.grid, height }}
      >
        {p.background}
        {blocks.map((b) => (
          <TaskBlock key={b.key} block={b} {...p} />
        ))}
        {prop.blocks.map((b) => (
          <TaskBlock key={`p-${b.key}`} block={b} proposedBlock {...p} />
        ))}
      </div>
    </div>
  );
}

function TaskBlock({
  block,
  proposedBlock,
  ...p
}: RowProps & { block: Block; proposedBlock?: boolean }) {
  const first = block.tasks[0]!;
  const ids = block.tasks.map((t) => t.id);
  const conflict = block.tasks
    .map((t) => p.conflicts.get(t.id))
    .find((r) => r && r.level === "block");
  const warn = block.tasks.map((t) => p.conflicts.get(t.id)).find((r) => r && r.level === "warn");
  const pending = block.tasks.some(isPending);
  const cancelled = block.tasks.every(isCancelled);
  const dup = block.tasks.some((t) => p.duplicates.has(t.id));
  const label = blockLabel(block.tasks);
  const name = `${block.tasks.length > 1 ? `${block.tasks.length} prises en charge : ` : ""}${block.tasks.map(taskName).join(" ; ")}${conflict ? `. Conflit : ${conflict.reasons.join(", ")}` : warn ? `. Attention : ${warn.reasons.join(", ")}` : ""}${dup ? ". Doublon probable" : ""}${proposedBlock ? ". Proposition" : ""}`;
  const style = {
    ...toneStyle(first.kind),
    ...span(block.start, block.end, p.bounds, p.px),
    top: PAD + block.lane * LANE,
    height: LANE - 6,
  };
  const draggable = p.canWrite && !proposedBlock && !cancelled;
  return (
    <button
      type="button"
      data-hl={first.id}
      data-task-block={ids.join(",")}
      data-testid={proposedBlock ? "planner-proposed" : "planner-block"}
      aria-label={name}
      title={name}
      onClick={() => !proposedBlock && p.onOpen(first.id)}
      onPointerDown={draggable ? (e) => p.onDragStart(e, ids, label) : undefined}
      className={cn(
        "absolute z-[1] flex min-w-0 cursor-pointer flex-col items-start justify-center overflow-hidden rounded-control px-1 text-left leading-tight",
        TONED,
        pending && "border-dashed",
        proposedBlock && "border-2 border-dashed border-accent bg-accent-faint",
        cancelled && "opacity-55 [&_*]:line-through",
        conflict && "ring-2 ring-danger",
        !conflict && warn && "ring-2 ring-warn",
        p.selectedId && ids.includes(p.selectedId) && "outline-2 outline-offset-1 outline-accent",
      )}
      style={style}
    >
      <span className="w-full truncate font-mono text-label font-semibold text-fg">{label}</span>
      <span className="w-full truncate font-mono text-label text-fg-muted">
        {first.train ?? (isPmr(first) ? "Taxi" : first.station)}
      </span>
      {conflict || dup ? (
        <span
          aria-hidden
          className={cn(
            "absolute top-0.5 right-0.5 size-1.5 rounded-pill",
            conflict ? "bg-danger" : "bg-warn",
          )}
        />
      ) : null}
    </button>
  );
}
