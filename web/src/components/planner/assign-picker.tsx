"use client";

import { Car, Store, TrainFront } from "lucide-react";
import * as React from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet } from "@/components/ui/sheet";
import {
  checkAssign,
  hhmm,
  suggestAgents,
  type PlannerAssignee,
  type PlannerContext,
  type PlannerTask,
} from "@/lib/planner";
import { refMs } from "@/lib/planner/board";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn, pl } from "@/lib/utils";

// « Attribuer à… » : alternative clavier / tactile au glisser-déposer, et proposition quand l'agent visé est occupé.
// Disponibles d'abord (`suggestAgents` : agent libre en tête, guichet B-CS quand il est permis), puis taxi / chef de bord,
// puis les agents non disponibles avec la raison. Desktop : fenêtre ; mobile : feuille du bas.

export type PickerState = {
  ids: string[];
  /** Agent visé occupé : phrase affichée en tête. */
  note?: string;
};

const ms = (iso: string) => Date.parse(iso);

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function AssignPicker({
  state,
  onClose,
  ctx,
  onPick,
}: {
  state: PickerState | null;
  onClose: () => void;
  ctx: PlannerContext;
  onPick: (ids: string[], target: PlannerAssignee) => void;
}) {
  const desktop = useMediaQuery("(min-width: 768px)");
  const task = state ? ctx.tasks.find((t) => t.id === state.ids[0]) : undefined;
  const title = "Attribuer à…";
  const description = task ? describe(task, state!.ids.length) : undefined;
  const body = task ? <PickerBody task={task} state={state!} ctx={ctx} onPick={onPick} /> : null;
  if (desktop)
    return (
      <Dialog open={!!state && !!task} onOpenChange={(o) => !o && onClose()}>
        {task ? (
          <DialogContent
            title={title}
            description={description}
            className="max-w-xl"
            data-testid="assign-picker"
          >
            {body}
          </DialogContent>
        ) : null}
      </Dialog>
    );
  return (
    <Sheet
      open={!!state && !!task}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={description}
    >
      <div data-testid="assign-picker">{body}</div>
    </Sheet>
  );
}

function describe(t: PlannerTask, n: number) {
  const dir = t.kind === "pmr_in" ? "IN" : t.kind === "pmr_out" ? "OUT" : "";
  return [
    hhmm(refMs(t)),
    `${Math.max(1, t.pax || 1)}${t.pmrType ?? ""} ${dir}`.trim(),
    t.train ? `train ${t.train}` : "",
    t.station,
    `fenêtre ${hhmm(ms(t.start))}–${hhmm(ms(t.end))}`,
    n > 1 ? `+ ${n - 1} ${pl(n - 1, "tâche liée", "tâches liées")}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function PickerBody({
  task,
  state,
  ctx,
  onPick,
}: {
  task: PlannerTask;
  state: PickerState;
  ctx: PlannerContext;
  onPick: (ids: string[], target: PlannerAssignee) => void;
}) {
  const sugg = React.useMemo(() => suggestAgents(task, ctx, 60), [task, ctx]);
  const unavailable = React.useMemo(() => {
    const ok = new Set(sugg.map((s) => s.target.agentId).filter(Boolean));
    return ctx.agents
      .filter((a) => !ok.has(a.id))
      .map((a) => ({ agent: a, r: checkAssign(task, { kind: "agent", agentId: a.id }, ctx) }))
      .filter((x) => x.r.level === "block")
      .sort((a, b) => a.agent.name.localeCompare(b.agent.name, "fr"));
  }, [sugg, ctx, task]);
  const agentById = new Map(ctx.agents.map((a) => [a.id, a]));
  const service = (id: string) =>
    (agentById.get(id)?.shifts ?? [])
      .map((s) => `${hhmm(ms(s.start)).slice(0, 2)}–${hhmm(ms(s.end)).slice(0, 2)}`)
      .join(", ");
  const pick = (target: PlannerAssignee) => onPick(state.ids, target);
  return (
    <div className="flex flex-col gap-4">
      {state.note ? (
        <p
          role="status"
          className="rounded-box border border-warn/50 bg-[color-mix(in_oklab,var(--warn)_10%,var(--surface))] p-3 text-small"
        >
          {state.note}
        </p>
      ) : null}
      <section className="flex flex-col gap-1.5">
        <h3 className="label-mono text-fg-muted">Disponibles ({sugg.length})</h3>
        {sugg.length === 0 ? (
          <p className="text-small text-fg-muted">
            Aucun agent en service ne peut la prendre : prévois un taxi ou le chef de bord.
          </p>
        ) : null}
        <ul className="flex flex-col gap-1.5">
          {sugg.map((s, i) => {
            const a = s.target.agentId ? agentById.get(s.target.agentId) : undefined;
            const name =
              s.target.kind === "bcs"
                ? `Guichet B-CS · ${s.target.label}`
                : (a?.name ?? s.target.label ?? "");
            return (
              <li key={`${s.target.kind}-${s.target.agentId ?? s.target.label}`}>
                <button
                  type="button"
                  onClick={() => pick(s.target)}
                  data-testid="picker-option"
                  className={cn(
                    "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-box border px-3 py-2 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent",
                    i === 0
                      ? "border-ok/60 bg-[color-mix(in_oklab,var(--ok)_8%,var(--surface))]"
                      : "border-border",
                  )}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-pill bg-surface-2 text-label font-semibold text-fg-muted">
                    {s.target.kind === "bcs" ? (
                      <Store aria-hidden className="size-4" />
                    ) : (
                      initials(name)
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body font-semibold">{name}</span>
                    {a ? (
                      <span className="truncate text-label text-fg-muted">
                        {a.post} · {a.base} · {service(a.id)}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "max-w-[45%] text-right text-label",
                      s.level === "warn" ? "text-warn" : "text-ok",
                    )}
                  >
                    {s.level === "warn" && s.reasons[0] ? s.reasons[0] : s.reason}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="flex flex-col gap-1.5">
        <h3 className="label-mono text-fg-muted">Autres destinations</h3>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => pick({ kind: "taxi", label: "Taxi" })}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-box border border-border px-3 text-body hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
            data-testid="picker-taxi"
          >
            <Car aria-hidden className="size-4" /> Taxi PMR
          </button>
          <button
            type="button"
            onClick={() =>
              pick({ kind: "cdb", label: task.train ? `Train ${task.train}` : "Chef de bord" })
            }
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-box border border-border px-3 text-body hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
            data-testid="picker-cdb"
          >
            <TrainFront aria-hidden className="size-4" /> Chef de bord
          </button>
        </div>
      </section>
      {unavailable.length ? (
        <section className="flex flex-col gap-1.5">
          <h3 className="label-mono text-fg-muted">Non disponibles ({unavailable.length})</h3>
          <ul className="flex flex-col gap-1">
            {unavailable.map(({ agent: a, r }) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-box px-3 py-1.5 text-fg-muted"
                aria-label={`${a.name} non disponible : ${r.reasons.join(", ")}`}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-pill bg-surface-2 text-label">
                  {initials(a.name)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-small">{a.name}</span>
                  <span className="truncate text-label">
                    {a.post} · {a.base} · {service(a.id) || "sans service"}
                  </span>
                </span>
                <span className="max-w-[50%] text-right text-label text-danger">
                  {r.reasons[0]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
