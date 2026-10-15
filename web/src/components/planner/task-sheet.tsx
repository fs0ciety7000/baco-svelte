"use client";

import { AlertTriangle, Car, Copy, Trash2 } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/status-badge";
import { TrainChip } from "@/components/ui/train-chip";
import {
  checkAssign,
  hhmm,
  isCancelled,
  isPmr,
  pmrCategory,
  type AgentTimeline,
  type PlannerContext,
  type PlannerTask,
} from "@/lib/planner";
import type { ServerTask } from "@/lib/planner/adapt";
import { KIND_LABEL, PMR_TYPE_LABEL, isPending, refMs } from "@/lib/planner/board";
import { cn } from "@/lib/utils";

import { DirChip, PaxChip } from "./task-visuals";

// Panneau d'une tâche : détail, fenêtre, source DICOS, autres tâches du même dossier, destination, trajet calculé,
// contrôles, et actions (changer d'agent, retirer l'agent, supprimer une saisie, garder la tâche DICOS d'un doublon).

const ms = (iso: string) => Date.parse(iso);

export type TaskSheetProps = {
  task: PlannerTask | null;
  server: ServerTask | undefined;
  ctx: PlannerContext;
  timelines: Map<string, AgentTimeline>;
  zone: string;
  duplicateOf: string | undefined;
  canWrite: boolean;
  canManage: boolean;
  busy: boolean;
  onClose: () => void;
  onOpen: (id: string) => void;
  onChange: (id: string) => void;
  onUnassign: (id: string) => void;
  onDelete: (id: string) => void;
  onResolveDuplicate: (manualId: string, dicosId: string) => void;
};

function sourceLabel(t: PlannerTask, s: ServerTask | undefined): string {
  if (t.source === "dicos_attente")
    return isCancelled(t) ? "DICOS · dossier annulé" : "DICOS · en attente d'acceptation";
  if (t.source === "dicos") return isCancelled(t) ? "DICOS · annulée" : "DICOS · acceptée";
  if (t.source === "modele") return "Modèle de la semaine";
  return s?.origin === "auto" ? "Saisie manuelle (attribution automatique)" : "Saisie manuelle";
}

export function TaskSheet(p: TaskSheetProps) {
  const t = p.task;
  const [cached, setCached] = React.useState<PlannerTask | null>(t);
  React.useEffect(() => {
    if (t) setCached(t);
  }, [t]);
  const shown = t ?? cached;
  const dir =
    shown?.kind === "pmr_in"
      ? "IN · embarquement"
      : shown?.kind === "pmr_out"
        ? "OUT · débarquement"
        : "";
  const title = shown
    ? isPmr(shown)
      ? `${PMR_TYPE_LABEL[shown.pmrType ?? ""] ?? (pmrCategory(shown) === "wheelchair" ? "Fauteuil roulant" : "Assistance légère")}${shown.train ? ` · train ${shown.train}` : ""}`
      : shown.label || KIND_LABEL[shown.kind]
    : "Tâche";
  const assignee = shown?.assignee;
  const agent =
    assignee?.kind === "agent" ? p.ctx.agents.find((a) => a.id === assignee.agentId) : undefined;
  const check =
    shown && assignee && (assignee.kind === "agent" || assignee.kind === "bcs")
      ? checkAssign(shown, assignee, p.ctx)
      : null;
  const tl = agent ? p.timelines.get(agent.id) : undefined;
  const around = React.useMemo(() => {
    if (!tl || !shown) return [];
    const i = tl.items.findIndex((x) => x.type === "task" && x.task.id === shown.id);
    if (i < 0) return [];
    return tl.items.slice(Math.max(0, i - 2), i + 3).filter((x) => x.type !== "libre");
  }, [tl, shown]);
  const siblings = shown?.dossier
    ? p.ctx.tasks
        .filter((x) => x.dossier === shown.dossier && x.id !== shown.id)
        .sort((a, b) => refMs(a) - refMs(b))
    : [];
  const manual = shown?.source === "manuel" || shown?.source === "modele";
  const canDelete = p.canWrite && shown && (manual || p.canManage);
  const footer =
    shown && p.canWrite && !isCancelled(shown) ? (
      <>
        <Button
          variant="primary"
          onClick={() => p.onChange(shown.id)}
          disabled={p.busy}
          data-testid="sheet-change"
        >
          {assignee ? "Changer d'agent" : "Attribuer à…"}
        </Button>
        {assignee ? (
          <Button
            variant="danger"
            onClick={() => p.onUnassign(shown.id)}
            disabled={p.busy}
            data-testid="sheet-unassign"
          >
            Retirer l&apos;agent
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            variant="ghost"
            className="ml-auto"
            onClick={() => p.onDelete(shown.id)}
            disabled={p.busy}
            aria-label="Supprimer la tâche"
            data-testid="sheet-delete"
          >
            <Trash2 aria-hidden /> Supprimer
          </Button>
        ) : null}
      </>
    ) : shown && canDelete ? (
      <Button
        variant="ghost"
        onClick={() => p.onDelete(shown.id)}
        disabled={p.busy}
        data-testid="sheet-delete"
      >
        <Trash2 aria-hidden /> Supprimer
      </Button>
    ) : undefined;

  return (
    <Sheet
      open={!!t}
      onOpenChange={(o) => !o && p.onClose()}
      eyebrow={
        shown
          ? [isPmr(shown) ? `${Math.max(1, shown.pax || 1)}${shown.pmrType ?? ""}` : "", dir]
              .filter(Boolean)
              .join(" · ") || KIND_LABEL[shown.kind]
          : undefined
      }
      title={title}
      description={
        shown
          ? [shown.station, p.server?.district, p.zone ? `zone ${p.zone}` : ""]
              .filter(Boolean)
              .join(" · ")
          : undefined
      }
      footer={footer}
    >
      {shown ? (
        <div className="flex flex-col gap-5" data-testid="task-sheet">
          {check && check.level !== "ok" ? (
            <p
              role="alert"
              className={cn(
                "flex gap-2 rounded-box border p-3 text-small",
                check.level === "block"
                  ? "border-danger/50 bg-[color-mix(in_oklab,var(--danger)_8%,var(--surface))] text-danger"
                  : "border-warn/50 bg-[color-mix(in_oklab,var(--warn)_8%,var(--surface))] text-warn",
              )}
            >
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong>{check.level === "block" ? "Conflit" : "Attention"}</strong> —{" "}
                {check.reasons.join(" · ")}
              </span>
            </p>
          ) : null}
          {p.duplicateOf ? (
            <div
              className="flex flex-col gap-2 rounded-box border border-warn/50 bg-[color-mix(in_oklab,var(--warn)_8%,var(--surface))] p-3"
              data-testid="sheet-duplicate"
            >
              <p className="flex items-center gap-2 text-small font-semibold">
                <Copy aria-hidden className="size-4" /> Doublon probable
              </p>
              <p className="text-small text-fg-muted">
                Cette saisie correspond à une prise en charge arrivée de DICOS (même dossier, train,
                sens et gare).
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => p.onOpen(p.duplicateOf!)}>
                  Voir la tâche DICOS
                </Button>
                {p.canWrite ? (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => p.onResolveDuplicate(shown.id, p.duplicateOf!)}
                    disabled={p.busy}
                    data-testid="sheet-keep-dicos"
                  >
                    Garder DICOS, supprimer la saisie
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          <dl className="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-2 text-small">
            {shown.trainAt ? (
              <>
                <dt className="text-fg-muted">Heure du train</dt>
                <dd className="flex items-center gap-2 font-mono font-semibold tabular">
                  {hhmm(ms(shown.trainAt))}{" "}
                  {shown.train ? <TrainChip train={shown.train} size="sm" /> : null}
                </dd>
              </>
            ) : null}
            <dt className="text-fg-muted">{isPmr(shown) ? "Fenêtre" : "Horaire"}</dt>
            <dd className="font-mono tabular">
              {hhmm(ms(shown.start))} – {hhmm(ms(shown.end))}{" "}
              <span className="font-sans text-fg-muted">
                ({Math.round((ms(shown.end) - ms(shown.start)) / 60_000)} min)
              </span>
            </dd>
            {isPmr(shown) ? (
              <>
                <dt className="text-fg-muted">Voyageurs</dt>
                <dd className="flex items-center gap-2">
                  <PaxChip task={shown} />
                  <DirChip task={shown} />
                  {PMR_TYPE_LABEL[shown.pmrType ?? ""] ?? ""}
                </dd>
              </>
            ) : null}
            {shown.otherStation ? (
              <>
                <dt className="text-fg-muted">{shown.kind === "pmr_in" ? "Vers" : "Venant de"}</dt>
                <dd>{shown.otherStation}</dd>
              </>
            ) : null}
            <dt className="text-fg-muted">Source</dt>
            <dd className="flex flex-wrap items-center gap-1.5">
              {sourceLabel(shown, p.server)}
              {isPending(shown) && !isCancelled(shown) ? (
                <Badge tone="warn">En attente DICOS</Badge>
              ) : null}
              {isCancelled(shown) ? <Badge tone="danger">Annulée</Badge> : null}
            </dd>
            {shown.dossier ? (
              <>
                <dt className="text-fg-muted">Dossier</dt>
                <dd className="font-mono tabular">{shown.dossier}</dd>
              </>
            ) : null}
          </dl>

          <section className="flex flex-col gap-2">
            <h3 className="label-mono text-fg-muted">Destination</h3>
            {assignee ? (
              <div
                className="flex items-center gap-3 rounded-box border border-border p-3"
                data-testid="sheet-assignee"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-body font-semibold">
                    {agent?.name ??
                      (assignee.kind === "bcs"
                        ? `Guichet B-CS · ${assignee.label ?? shown.station}`
                        : assignee.kind === "taxi"
                          ? "Taxi PMR"
                          : assignee.kind === "cdb"
                            ? "Chef de bord"
                            : "Agent inconnu")}
                  </span>
                  {agent ? (
                    <span className="text-label text-fg-muted">
                      {agent.post} · {agent.base} ·{" "}
                      {agent.shifts
                        .map((s) => `${hhmm(ms(s.start))}–${hhmm(ms(s.end))}`)
                        .join(", ")}
                      {tl ? ` · ${tl.occupancy} % occupé` : ""}
                    </span>
                  ) : null}
                </span>
              </div>
            ) : (
              <p className="text-small text-fg-muted">Pas encore attribuée.</p>
            )}
          </section>

          {around.length ? (
            <section className="flex flex-col gap-2">
              <h3 className="label-mono text-fg-muted">Trajet calculé</h3>
              <ol className="flex flex-col gap-1.5 text-small" data-testid="sheet-route">
                {around.map((it, i) => (
                  <li key={i} className="grid grid-cols-[3.5rem_1fr] gap-2">
                    <span className="font-mono text-fg-muted tabular">{hhmm(ms(it.start))}</span>
                    {it.type === "trajet" ? (
                      <span
                        className={cn(
                          "flex items-center gap-1.5",
                          it.conflict ? "text-danger" : "text-fg-muted",
                        )}
                      >
                        <Car aria-hidden className="size-3.5" />
                        {it.label}
                        {it.minutes !== null ? ` · ${it.minutes} min` : " · trajet inconnu"}
                      </span>
                    ) : it.type === "task" ? (
                      <span className={cn(it.task.id === shown.id && "font-semibold")}>
                        {it.task.id === shown.id
                          ? "Cette tâche"
                          : it.task.label ||
                            `${it.task.pmrType ?? ""} ${it.task.kind === "pmr_in" ? "IN" : it.task.kind === "pmr_out" ? "OUT" : ""}`.trim()}
                        {it.task.train ? ` · train ${it.task.train}` : ""} · {it.task.station}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {shown.dossier ? (
            <section className="flex flex-col gap-2">
              <h3 className="label-mono text-fg-muted">Dossier {shown.dossier}</h3>
              {siblings.length ? (
                <ul className="flex flex-col gap-1.5" data-testid="sheet-dossier">
                  {siblings.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => p.onOpen(s.id)}
                        className="flex min-h-11 w-full cursor-pointer flex-wrap items-center gap-2 rounded-box border border-border px-3 py-2 text-left text-small hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        <span className="font-mono font-semibold tabular">{hhmm(refMs(s))}</span>
                        <PaxChip task={s} />
                        <DirChip task={s} />
                        {s.train ? <TrainChip train={s.train} size="sm" /> : null}
                        <span>{s.station}</span>
                        <span className="ml-auto text-label text-fg-muted">
                          {s.assignee ? "attribuée" : isCancelled(s) ? "annulée" : "à attribuer"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-small text-fg-muted">
                  Une seule prise en charge dans ce dossier.
                </p>
              )}
            </section>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
