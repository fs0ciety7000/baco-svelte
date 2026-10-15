"use client";

import { Car } from "lucide-react";
import * as React from "react";

import { Select } from "@/components/ui/select";
import { TrainChip } from "@/components/ui/train-chip";
import { hhmm, type AgentTimeline, type PlannerAgent, type CheckResult } from "@/lib/planner";
import { taskName } from "@/lib/planner/board";
import { cn } from "@/lib/utils";

import { durationLabel } from "./day-gantt";
import { DirChip, PaxChip, TONED, toneStyle } from "./task-visuals";

// Mobile (< 768 px) : agenda vertical d'un agent (sélecteur, tâches, trajets, temps libres, trait « maintenant »).
// Pas de glisser au doigt : on attribue depuis l'onglet « À attribuer » (« Attribuer à… »).

const ms = (iso: string) => Date.parse(iso);

export function MobileAgenda({
  agents,
  agentId,
  onAgent,
  timelines,
  conflicts,
  now,
  onOpen,
}: {
  agents: PlannerAgent[];
  agentId: string;
  onAgent: (id: string) => void;
  timelines: Map<string, AgentTimeline>;
  conflicts: Map<string, CheckResult>;
  now: number | null;
  onOpen: (id: string) => void;
}) {
  const agent = agents.find((a) => a.id === agentId) ?? agents[0];
  const tl = agent ? timelines.get(agent.id) : undefined;
  const service = (a: PlannerAgent) =>
    a.shifts.map((s) => `${hhmm(ms(s.start))}–${hhmm(ms(s.end))}`).join(", ");
  if (!agent)
    return (
      <p className="rounded-box border border-border bg-surface p-4 text-small text-fg-muted">
        Aucun agent de gare en service ce jour pour ces districts.
      </p>
    );
  const items = tl?.items ?? [];
  const nowIdx = now === null ? -1 : items.findIndex((it) => ms(it.start) > now);
  const first = agent.shifts[0];
  const last = agent.shifts[agent.shifts.length - 1];
  return (
    <div className="flex flex-col gap-3" data-testid="mobile-agenda">
      <label className="w-full min-w-0">
        <span className="sr-only">Agent</span>
        <Select
          value={agent.id}
          onValueChange={(v) => v && onAgent(v)}
          label="Agent"
          aria-label="Agent"
          options={agents.map((a) => ({
            value: a.id,
            label: `${a.name} — ${a.post} · ${a.base}`,
            hint: service(a),
          }))}
        />
      </label>
      <div className="rounded-box border border-border bg-surface p-3 shadow-rest">
        <div className="flex items-start justify-between gap-2 border-b border-border pb-2">
          <div className="min-w-0">
            <p className="text-small font-semibold">
              {agent.post} · {agent.base}{" "}
              <span className="font-normal text-fg-muted">· {service(agent)}</span>
            </p>
          </div>
          <span className="shrink-0 text-small text-fg-muted tabular">
            {tl?.occupancy ?? 0} % occupé
          </span>
        </div>
        <ol className="flex flex-col">
          {first ? (
            <AgendaRow time={hhmm(ms(first.start))}>
              <span className="block rounded-box bg-surface-2 px-3 py-2 text-small text-fg-muted">
                Prise de service
              </span>
            </AgendaRow>
          ) : null}
          {items.map((it, i) => (
            <React.Fragment key={i}>
              {i === nowIdx ? <NowRow now={now!} /> : null}
              {it.type === "task" ? (
                <AgendaRow time={hhmm(ms(it.start))} sub={hhmm(ms(it.end))}>
                  <button
                    type="button"
                    onClick={() => onOpen(it.task.id)}
                    aria-label={taskName(it.task)}
                    style={toneStyle(it.task.kind)}
                    className={cn(
                      "flex min-h-11 w-full cursor-pointer flex-col items-start gap-1 rounded-box px-3 py-2 text-left",
                      TONED,
                      conflicts.get(it.task.id)?.level === "block" && "ring-2 ring-danger",
                    )}
                  >
                    <span className="flex flex-wrap items-center gap-1.5">
                      <PaxChip task={it.task} />
                      <DirChip task={it.task} />
                      {it.task.train ? <TrainChip train={it.task.train} size="sm" /> : null}
                    </span>
                    <span className="text-small text-fg-muted">
                      {it.task.station}
                      {it.task.trainAt ? ` · train à ${hhmm(ms(it.task.trainAt))}` : ""}
                    </span>
                  </button>
                </AgendaRow>
              ) : it.type === "trajet" ? (
                <AgendaRow
                  time={hhmm(ms(it.start))}
                  sub={it.minutes !== null ? `${it.minutes} min` : undefined}
                >
                  <span
                    className={cn(
                      "flex items-center gap-2 rounded-box border border-dashed px-3 py-2 text-small",
                      it.conflict
                        ? "border-danger text-danger"
                        : "border-border-strong text-fg-muted",
                    )}
                  >
                    <Car aria-hidden className="size-4 shrink-0" />
                    {it.label} · arrivée {hhmm(ms(it.end))}
                  </span>
                </AgendaRow>
              ) : (
                <AgendaRow time={hhmm(ms(it.start))}>
                  <span className="block rounded-box bg-surface-2 px-3 py-2 text-small text-fg-muted">
                    Libre · {durationLabel(it.minutes)}
                  </span>
                </AgendaRow>
              )}
            </React.Fragment>
          ))}
          {nowIdx === -1 && now !== null && last && now < ms(last.end) && now > ms(last.start) ? (
            <NowRow now={now} />
          ) : null}
          {last ? (
            <AgendaRow time={hhmm(ms(last.end))}>
              <span className="block rounded-box bg-surface-2 px-3 py-2 text-small text-fg-muted">
                Fin de service
              </span>
            </AgendaRow>
          ) : null}
        </ol>
      </div>
    </div>
  );
}

function AgendaRow({
  time,
  sub,
  children,
}: {
  time: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-2 border-b border-border py-2 last:border-b-0">
      <span className="flex flex-col font-mono text-small font-semibold tabular">
        {time}
        {sub ? <span className="text-label font-normal text-fg-muted">{sub}</span> : null}
      </span>
      <div className="min-w-0">{children}</div>
    </li>
  );
}

function NowRow({ now }: { now: number }) {
  return (
    <li className="flex items-center gap-2 py-1" data-testid="agenda-now">
      <span className="font-mono text-small font-semibold text-danger tabular">{hhmm(now)}</span>
      <span aria-hidden className="h-0.5 flex-1 bg-danger" />
      <span className="sr-only">maintenant</span>
    </li>
  );
}
