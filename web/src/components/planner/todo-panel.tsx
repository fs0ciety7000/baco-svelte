"use client";

import { Car, GripVertical, TrainFront, Wand2 } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filters";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/status-badge";
import { TrainChip } from "@/components/ui/train-chip";
import { hhmm, type AutoResult, type PlannerAssignee, type PlannerTask } from "@/lib/planner";
import type { ServerTask } from "@/lib/planner/adapt";
import {
  filterTodo,
  isPending,
  refMs,
  taskMatches,
  taskName,
  type TodoFilter,
} from "@/lib/planner/board";
import { stationKey } from "@/lib/planner";
import { cn, pl } from "@/lib/utils";

import { DirChip, PaxChip, TONED, toneStyle } from "./task-visuals";

// Colonne « À attribuer » (triée par heure, filtres source / zone / gare) et aperçu de l'attribution automatique.

const ms = (iso: string) => Date.parse(iso);

export type TodoProps = {
  tasks: PlannerTask[];
  zones: Map<string, string>;
  zoneCodes: string[];
  filter: TodoFilter;
  onFilter: (f: TodoFilter) => void;
  duplicates: Set<string>;
  server: Map<string, ServerTask>;
  q: string;
  now: number | null;
  canWrite: boolean;
  dropActive: boolean;
  dropOver: boolean;
  onOpen: (id: string) => void;
  onAssign: (id: string) => void;
  onDragStart: (e: React.PointerEvent, ids: string[], label: string, handle?: boolean) => void;
  /** Mobile : cartes plus hautes, bouton « Attribuer à… » toujours visible. */
  mobile?: boolean;
};

export function TodoList(p: TodoProps) {
  const all = React.useMemo(
    () => filterTodo(p.tasks, { source: "toutes", zone: "", station: "" }, p.zones),
    [p.tasks, p.zones],
  );
  const list = React.useMemo(
    () => filterTodo(p.tasks, p.filter, p.zones).filter((t) => taskMatches(t, p.q)),
    [p.tasks, p.filter, p.zones, p.q],
  );
  const pending = all.filter(isPending).length;
  const stations = [...new Set(all.map((t) => t.station))].sort((a, b) => a.localeCompare(b, "fr"));
  const byHour: { hour: string; items: PlannerTask[] }[] = [];
  for (const t of list) {
    const h = `${hhmm(refMs(t)).slice(0, 2)}h`;
    const last = byHour[byHour.length - 1];
    if (last?.hour === h) last.items.push(t);
    else byHour.push({ hour: h, items: [t] });
  }
  const set = (patch: Partial<TodoFilter>) => p.onFilter({ ...p.filter, ...patch });
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        p.dropActive && "rounded-box",
        p.dropOver && "outline-2 outline-ok",
      )}
      data-drop-key="todo"
      data-drop={p.dropActive ? "ok" : undefined}
    >
      <div className="flex flex-col gap-2 border-b border-border p-3" data-testid="todo-filters">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Source">
          <FilterChip
            pressed={p.filter.source === "toutes"}
            onClick={() => set({ source: "toutes" })}
          >
            Toutes
          </FilterChip>
          <FilterChip
            pressed={p.filter.source === "acceptees"}
            onClick={() => set({ source: "acceptees" })}
          >
            Acceptées
          </FilterChip>
          <FilterChip
            pressed={p.filter.source === "attente"}
            onClick={() => set({ source: "attente" })}
          >
            En attente ({pending})
          </FilterChip>
        </div>
        {p.zoneCodes.length > 1 ? (
          <div
            className="flex gap-1.5 max-md:-mx-3 max-md:overflow-x-auto max-md:px-3 max-md:[scrollbar-width:none] md:flex-wrap"
            role="group"
            aria-label="Zone"
          >
            <FilterChip pressed={!p.filter.zone} onClick={() => set({ zone: "" })}>
              Toutes zones
            </FilterChip>
            {p.zoneCodes.map((z) => (
              <FilterChip key={z} pressed={p.filter.zone === z} onClick={() => set({ zone: z })}>
                {z}
              </FilterChip>
            ))}
          </div>
        ) : null}
        <label className="w-full min-w-0">
          <span className="sr-only">Gare</span>
          <Select
            value={p.filter.station}
            onValueChange={(v) => set({ station: v })}
            clearable
            placeholder="Toutes les gares"
            label="Gare"
            options={stations.map((s) => ({ value: s, label: s }))}
            aria-label="Gare"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2" data-testid="todo-list">
        {list.length === 0 ? (
          <p className="p-4 text-small text-fg-muted">
            {all.length === 0
              ? "Tout est attribué pour ce jour."
              : "Aucune prise en charge pour ces filtres."}
          </p>
        ) : null}
        {byHour.map((g) => (
          <div key={g.hour} className="flex flex-col gap-1.5 pb-2">
            <p className="px-1 pt-1 font-mono text-label text-fg-muted">{g.hour}</p>
            {g.items.map((t) => (
              <TodoCard key={t.id} task={t} {...p} />
            ))}
          </div>
        ))}
      </div>
      {!p.mobile ? (
        <p className="border-t border-border p-3 text-label text-fg-muted">
          Glisse une prise en charge sur la ligne d&apos;un agent, ou utilise « Attribuer à… ».
        </p>
      ) : null}
    </div>
  );
}

function TodoCard({ task: t, ...p }: TodoProps & { task: PlannerTask }) {
  const s = p.server.get(t.id);
  const ref = refMs(t);
  const soon = p.now !== null && ref - p.now > 0 && ref - p.now <= 30 * 60_000;
  const late = p.now !== null && ms(t.end) < p.now;
  const dup = p.duplicates.has(t.id);
  const label = `${t.pax > 1 ? t.pax : 1}${t.pmrType ?? ""} ${t.train ?? ""}`.trim();
  return (
    <article
      data-hl={t.id}
      data-testid="todo-card"
      data-task={t.id}
      aria-label={taskName(t)}
      onPointerDown={p.canWrite && !p.mobile ? (e) => p.onDragStart(e, [t.id], label) : undefined}
      className={cn(
        "relative flex items-start gap-2 rounded-box p-2 pl-1",
        TONED,
        isPending(t) && "border-dashed",
        late && "bg-[color-mix(in_oklab,var(--danger)_8%,var(--surface))]",
        p.canWrite && !p.mobile && "cursor-grab active:cursor-grabbing",
      )}
      style={toneStyle(t.kind)}
    >
      {p.canWrite ? (
        <span
          aria-hidden
          data-drag-handle
          onPointerDown={(e) => {
            e.stopPropagation();
            p.onDragStart(e, [t.id], label, true);
          }}
          className="grid w-6 shrink-0 cursor-grab touch-none place-items-center self-stretch text-fg-subtle max-md:hidden"
        >
          <GripVertical className="size-4" />
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => p.onOpen(t.id)}
        className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={`Ouvrir : ${taskName(t)}`}
      >
        <span className="flex w-full flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "font-mono text-body font-semibold tabular",
              late ? "text-danger" : "text-fg",
            )}
          >
            {hhmm(ref)}
          </span>
          <PaxChip task={t} />
          <DirChip task={t} />
          {t.train ? <TrainChip train={t.train} size="sm" /> : null}
        </span>
        <span className="font-mono text-label text-fg-muted tabular">
          {hhmm(ms(t.start))}–{hhmm(ms(t.end))}
        </span>
        <span className="flex flex-wrap gap-1">
          {isPending(t) ? <Badge tone="warn">En attente DICOS</Badge> : null}
          {soon ? <Badge tone="warn">dans {Math.round((ref - p.now!) / 60_000)} min</Badge> : null}
          {late ? <Badge tone="danger">En retard</Badge> : null}
          {dup ? <Badge tone="warn">Doublon probable</Badge> : null}
          {t.source === "manuel" ? <Badge tone="neutral">Saisie</Badge> : null}
        </span>
        <span className="w-full truncate text-small text-fg-muted">
          {t.station}
          {p.zones.get(stationKey(t.station)) ? ` · ${p.zones.get(stationKey(t.station))}` : ""}
          {s?.district ? ` · ${s.district}` : ""}
        </span>
      </button>
      {p.canWrite ? (
        <Button
          variant={p.mobile ? "secondary" : "ghost"}
          size="sm"
          className={cn("shrink-0 self-center", p.mobile && "h-11")}
          onClick={() => p.onAssign(t.id)}
          data-testid="todo-assign"
          aria-label={`Attribuer à… : ${taskName(t)}`}
        >
          Attribuer à…
        </Button>
      ) : null}
    </article>
  );
}

// ---------------------------------------------------------------------------------------------------------------

export type AutoPreviewProps = {
  result: AutoResult;
  ignored: Set<string>;
  tasks: Map<string, PlannerTask>;
  agentName: (id: string) => string;
  busy: boolean;
  onAccept: (ids: string[]) => void;
  onAcceptAll: () => void;
  onIgnore: (id: string) => void;
  onCancel: () => void;
  onOther: (id: string, kind: "taxi" | "cdb") => void;
  onChoose: (id: string) => void;
};

function targetLabel(t: PlannerAssignee, agentName: (id: string) => string) {
  if (t.kind === "agent") return agentName(t.agentId ?? "");
  if (t.kind === "bcs") return `Guichet B-CS ${t.label ?? ""}`;
  return t.kind === "taxi" ? "Taxi" : "Chef de bord";
}

export function AutoPreview(p: AutoPreviewProps) {
  const proposals = p.result.proposals.filter(
    (x) => !p.ignored.has(x.taskId) && p.tasks.has(x.taskId),
  );
  const unassigned = p.result.unassigned.filter(
    (x) => !p.ignored.has(x.taskId) && p.tasks.has(x.taskId),
  );
  const line = (id: string) => {
    const t = p.tasks.get(id)!;
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-small font-semibold tabular">{hhmm(refMs(t))}</span>
        <PaxChip task={t} />
        <DirChip task={t} />
        {t.train ? <TrainChip train={t.train} size="sm" /> : null}
        <span className="text-small text-fg-muted">{t.station}</span>
      </span>
    );
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="auto-preview">
      <div className="border-b border-border p-3">
        <p className="flex items-center gap-2 text-body font-semibold">
          <Wand2 aria-hidden className="size-4" /> Proposition de répartition
        </p>
        <p className="mt-1 text-small text-fg-muted">
          {proposals.length} {pl(proposals.length, "proposition")}
          {unassigned.length ? ` · ${unassigned.length} sans solution` : ""}. Vérifie, puis accepte
          une par une ou tout. Rien n&apos;est attribué avant d&apos;accepter.
        </p>
      </div>
      <ul className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {unassigned.map((u) => (
          <li
            key={u.taskId}
            className="flex flex-col gap-1.5 rounded-box border border-danger/50 bg-[color-mix(in_oklab,var(--danger)_7%,var(--surface))] p-2.5"
            data-testid="auto-unassigned"
          >
            {line(u.taskId)}
            <p className="text-small font-semibold text-danger">Aucun agent disponible</p>
            <ul className="text-label text-fg-muted">
              {u.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => p.onOther(u.taskId, "taxi")}
                disabled={p.busy}
              >
                <Car aria-hidden /> Taxi
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => p.onOther(u.taskId, "cdb")}
                disabled={p.busy}
              >
                <TrainFront aria-hidden /> Chef de bord
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => p.onChoose(u.taskId)}
                disabled={p.busy}
              >
                Choisir…
              </Button>
              <Button size="sm" variant="ghost" onClick={() => p.onIgnore(u.taskId)}>
                Ignorer
              </Button>
            </div>
          </li>
        ))}
        {proposals.map((x) => (
          <li
            key={x.taskId}
            className="flex items-start gap-2 rounded-box border border-border bg-surface p-2.5"
            data-testid="auto-proposal"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {line(x.taskId)}
              <p className="text-small font-semibold">→ {targetLabel(x.target, p.agentName)}</p>
              <p className="text-label text-fg-muted">{x.reason}</p>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => p.onAccept([x.taskId])}
                disabled={p.busy}
              >
                Accepter
              </Button>
              <Button size="sm" variant="ghost" onClick={() => p.onIgnore(x.taskId)}>
                Ignorer
              </Button>
            </div>
          </li>
        ))}
        {!proposals.length && !unassigned.length ? (
          <li className="p-4 text-small text-fg-muted">Plus rien à proposer.</li>
        ) : null}
      </ul>
      <div className="flex flex-wrap gap-2 border-t border-border p-3">
        <Button
          variant="primary"
          onClick={p.onAcceptAll}
          disabled={!proposals.length || p.busy}
          loading={p.busy}
          data-testid="auto-accept-all"
        >
          Tout accepter ({proposals.length})
        </Button>
        <Button variant="secondary" onClick={p.onCancel}>
          Fermer
        </Button>
      </div>
    </div>
  );
}
