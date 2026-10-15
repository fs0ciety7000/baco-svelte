"use client";

import { Clock, Plus, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { LiveHighlight } from "@/components/ui/live-highlight";
import { toast } from "@/components/ui/toast";
import {
  agentTimeline,
  autoAssign,
  stationKey,
  type AutoResult,
  type CheckResult,
  type PlannerAgent,
  type PlannerAssignee,
} from "@/lib/planner";
import { adaptDay, findDuplicates, type ServerDay } from "@/lib/planner/adapt";
import {
  agentMatches,
  applyOverrides,
  assigneeOf,
  boardCounters,
  conflictsOf,
  dayBounds,
  dropVerdict,
  groupAgents,
  isBusyRefusal,
  isTodo,
  linkedIds,
  SCALES,
  settledOverrides,
  stationZones,
  xOf,
  NO_FILTER,
  type DropTarget,
  type Override,
  type ScaleId,
  type TodoFilter,
} from "@/lib/planner/board";
import { subscribeLive, type LiveState } from "@/lib/live";
import type { StationRef } from "@/lib/stations/search";
import { cn, pl } from "@/lib/utils";
import {
  assignTask,
  assignTasks,
  createManualTasks,
  deleteTask,
  resolveDuplicate,
  unassignTask,
  type AssignTarget,
  type ManualTaskInput,
} from "@/app/(app)/pmr/planificateur/actions";

import { AddTaskDialog } from "./add-task-dialog";
import { AssignPicker, type PickerState } from "./assign-picker";
import { DayGantt, HEADER_W } from "./day-gantt";
import { MobileAgenda } from "./mobile-agenda";
import { TaskSheet } from "./task-sheet";
import { AutoPreview, TodoList } from "./todo-panel";

// PMR › Planificateur, vue Jour (lot P1, 15 oct. 2026) : état de l'écran, glisser-déposer (pointer events, souris et
// poignée au doigt), attributions optimistes avec « Annuler », attribution automatique, panneau, temps réel.

type Item = { id: string; assignee: PlannerAssignee | null };
type DragState = {
  ids: string[];
  label: string;
  x: number;
  y: number;
  over: string | null;
  verdicts: Map<string, CheckResult>;
};

const OK: CheckResult = { level: "ok", reasons: [] };

function toTarget(a: PlannerAssignee): AssignTarget {
  if (a.kind === "agent")
    return {
      kind: "agent",
      agentId: a.agentId ?? "",
      ...(a.label ? { label: a.label.slice(0, 80) } : {}),
    };
  return { kind: a.kind, ...(a.label ? { label: a.label.slice(0, 80) } : {}) };
}

function useNow(serverNow: number, live: boolean): number | null {
  const [now, setNow] = React.useState(serverNow);
  React.useEffect(() => {
    if (!live) return;
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [live]);
  return live ? now : null;
}

export function PlannerScreen({
  data,
  today,
  serverNow,
  filters,
  q,
  initialTask,
  canWrite,
  canManage,
  stations = [],
}: {
  /** Référentiel des gares (`stations` : FR, NL, alias, abréviation) pour la saisie au format ALEA. */
  stations?: StationRef[];
  data: ServerDay;
  today: string;
  serverNow: number;
  filters: React.ReactNode;
  q: string;
  initialTask: string;
  canWrite: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const day = data.day;
  const now = useNow(serverNow, day === today);
  const adapted = React.useMemo(() => adaptDay(data), [data]);
  const [overrides, setOverrides] = React.useState<Map<string, Override>>(() => new Map());
  const tasks = React.useMemo(
    () => applyOverrides(adapted.ctx.tasks, overrides),
    [adapted, overrides],
  );
  const ctx = React.useMemo(() => ({ ...adapted.ctx, tasks }), [adapted, tasks]);
  const byId = React.useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const conflicts = React.useMemo(() => conflictsOf(ctx), [ctx]);
  const counters = boardCounters(ctx, conflicts, day);
  const timelines = React.useMemo(
    () => new Map(ctx.agents.map((a) => [a.id, agentTimeline(a, ctx.tasks, ctx.bases)])),
    [ctx],
  );
  const groups = React.useMemo(() => groupAgents(ctx.agents, ctx.bases), [ctx.agents, ctx.bases]);
  const bounds = React.useMemo(
    () => dayBounds(day, ctx.agents, ctx.tasks),
    [day, ctx.agents, ctx.tasks],
  );
  const zones = React.useMemo(() => stationZones(ctx.bases), [ctx.bases]);
  const serverAgents = React.useMemo(
    () => new Map(data.agents.map((a) => [a.id, a])),
    [data.agents],
  );
  const dupPairs = React.useMemo(() => findDuplicates(data.tasks), [data.tasks]);
  const duplicates = React.useMemo(
    () => new Set(dupPairs.flatMap((d) => [d.manualId, d.dicosId])),
    [dupPairs],
  );
  const stationRefs = React.useMemo<StationRef[]>(() => {
    // Référentiel des gares d'abord (nom FR retenu, celui que le serveur accepte), puis bases et gares de leurs matrices.
    const out: StationRef[] = [];
    const seen = new Set<string>();
    for (const r of stations) {
      const k = stationKey(r.names[0]);
      if (!r.names[0] || seen.has(k)) continue;
      seen.add(k);
      out.push(r);
    }
    for (const b of ctx.bases) {
      if (!seen.has(stationKey(b.name))) {
        out.push({ abbr: b.code, names: [b.name] });
        seen.add(stationKey(b.name));
      }
      for (const t of b.travel)
        if (!seen.has(stationKey(t.station))) {
          seen.add(stationKey(t.station));
          out.push({ names: [t.station] });
        }
    }
    return out;
  }, [ctx.bases, stations]);
  const stationOptions = React.useMemo(
    () =>
      [...new Set(stationRefs.map((r) => r.names[0]!))].sort((a, b) => a.localeCompare(b, "fr")),
    [stationRefs],
  );

  // Refs pour les gestionnaires posés sur `window` (glisser) et les actions différées (« Annuler »).
  const ctxRef = React.useRef(ctx);
  ctxRef.current = ctx;
  const overridesRef = React.useRef(overrides);
  overridesRef.current = overrides;
  const serverRef = React.useRef(adapted.server);
  serverRef.current = adapted.server;
  const updatedOf = (id: string) =>
    overridesRef.current.get(id)?.updated ?? serverRef.current.get(id)?.updated ?? "";

  // Attributions rattrapées par le serveur : oubliées.
  React.useEffect(() => {
    const done = settledOverrides(overrides, (id) => adapted.server.get(id)?.updated);
    if (!done.length) return;
    setOverrides((m) => {
      const n = new Map(m);
      for (const id of done) n.delete(id);
      return n;
    });
  }, [adapted, overrides]);

  // ---------------------------------------------------------------------------------------------------------------
  // Panneau (URL `?tache=` par history.replaceState : jamais router.replace sous une action, CLAUDE.md §7)
  const [selected, setSelected] = React.useState<string | null>(initialTask || null);
  const suppressClick = React.useRef(false);
  const open = React.useCallback((id: string) => {
    if (suppressClick.current) return;
    setSelected(id);
  }, []);
  React.useEffect(() => {
    const u = new URL(window.location.href);
    if (selected) u.searchParams.set("tache", selected);
    else u.searchParams.delete("tache");
    if (u.href !== window.location.href) window.history.replaceState(window.history.state, "", u);
  }, [selected]);

  // ---------------------------------------------------------------------------------------------------------------
  // Actions
  const [busy, setBusy] = React.useState(false);
  const commit = React.useCallback(
    async (
      items: Item[],
      opts: { message?: string; undo?: boolean; auto?: boolean; warn?: string[] } = {},
    ): Promise<number> => {
      if (!items.length) return 0;
      const prev: Item[] = items.map((it) => ({
        id: it.id,
        assignee: ctxRef.current.tasks.find((t) => t.id === it.id)?.assignee ?? null,
      }));
      // Une tâche « faite » ne retourne jamais dans « À attribuer » (« Annuler » ne retire pas sa destination).
      const done0 = new Set(
        items
          .filter((it) => ctxRef.current.tasks.find((t) => t.id === it.id)?.status === "faite")
          .map((it) => it.id),
      );
      const stamps = new Map(items.map((it) => [it.id, updatedOf(it.id)]));
      setOverrides((m) => {
        const n = new Map(m);
        for (const it of items) n.set(it.id, { assignee: it.assignee });
        return n;
      });
      setBusy(true);
      type R = { id: string; ok: boolean; updated?: string; error?: string; conflict?: boolean };
      const results: R[] = [];
      const assigns = items.filter((i) => i.assignee);
      const unassigns = items.filter((i) => !i.assignee);
      try {
        if (assigns.length === 1 && !opts.auto) {
          const it = assigns[0]!;
          const r = await assignTask(it.id, toTarget(it.assignee!), stamps.get(it.id) ?? "");
          results.push(
            r.ok
              ? { id: it.id, ok: true, updated: r.updated }
              : { id: it.id, ok: false, error: r.error, conflict: r.conflict },
          );
        } else if (assigns.length) {
          const r = await assignTasks(
            assigns.map((it) => ({
              id: it.id,
              target: toTarget(it.assignee!),
              expectedUpdated: stamps.get(it.id) ?? "",
            })),
            !!opts.auto,
          );
          if (r.ok) results.push(...r.results);
          else
            for (const it of assigns)
              results.push({ id: it.id, ok: false, error: r.error, conflict: r.conflict });
        }
        for (const it of unassigns) {
          const r = await unassignTask(it.id, stamps.get(it.id) ?? "");
          results.push(
            r.ok
              ? { id: it.id, ok: true, updated: r.updated }
              : { id: it.id, ok: false, error: r.error, conflict: r.conflict },
          );
        }
      } catch {
        for (const it of items)
          if (!results.some((r) => r.id === it.id))
            results.push({
              id: it.id,
              ok: false,
              error: "Serveur injoignable : réessaie dans un instant.",
            });
      }
      const target = new Map(items.map((it) => [it.id, it.assignee]));
      setOverrides((m) => {
        const n = new Map(m);
        for (const r of results) {
          if (r.ok) n.set(r.id, { assignee: target.get(r.id) ?? null, updated: r.updated });
          else n.delete(r.id);
        }
        return n;
      });
      setBusy(false);
      const failed = results.filter((r) => !r.ok);
      const done = results.filter((r) => r.ok);
      if (failed.some((r) => r.conflict)) router.refresh();
      if (failed.length)
        toast.error(
          failed.length === results.length
            ? "Attribution refusée"
            : `${failed.length} ${pl(failed.length, "tâche")} non ${pl(failed.length, "modifiée")}`,
          { description: failed[0]!.error },
        );
      if (done.length && opts.message) {
        const okIds = new Set(done.map((r) => r.id));
        toast.success(opts.message, {
          ...(opts.warn?.length ? { description: `Attention : ${opts.warn.join(" · ")}` } : {}),
          ...(opts.undo
            ? {
                action: {
                  label: "Annuler",
                  onClick: () =>
                    void commit(
                      prev.filter(
                        (p) => okIds.has(p.id) && !(p.assignee === null && done0.has(p.id)),
                      ),
                      { message: "Modification annulée" },
                    ),
                },
              }
            : {}),
        });
      }
      return done.length;
    },
    [router],
  );

  const agentName = React.useCallback(
    (id: string) => ctxRef.current.agents.find((a) => a.id === id)?.name ?? "Agent",
    [],
  );
  const targetName = (t: PlannerAssignee) =>
    t.kind === "agent"
      ? agentName(t.agentId ?? "")
      : t.kind === "bcs"
        ? `guichet B-CS ${t.label ?? ""}`
        : t.kind === "taxi"
          ? "taxi"
          : "chef de bord";
  const describeIds = (ids: string[]) => {
    const t = ctxRef.current.tasks.find((x) => x.id === ids[0]);
    if (!t) return "Tâche";
    const base =
      `${Math.max(1, t.pax || 1)}${t.pmrType ?? ""} ${t.kind === "pmr_in" ? "IN" : t.kind === "pmr_out" ? "OUT" : (t.label ?? "")}`.trim();
    return `${base}${t.train ? ` · train ${t.train}` : ""}${ids.length > 1 ? ` (+${ids.length - 1})` : ""}`;
  };

  /** Attribue après contrôle ; refus expliqué, ou proposition d'un autre agent si l'agent visé est occupé. */
  const assignChecked = React.useCallback(
    (ids: string[], target: DropTarget, label?: string) => {
      const c = ctxRef.current;
      const v = dropVerdict(ids, target, c);
      const who = assigneeOf(target, label);
      if (v.level === "block") {
        if (target.kind === "agent" && isBusyRefusal(v)) {
          setPicker({
            ids,
            note: `${agentName(target.agentId)} est occupé(e) : ${v.reasons[0]}. Voici les agents libres.`,
          });
        } else toast.error("Attribution refusée", { description: v.reasons.join(" · ") });
        return;
      }
      setPicker(null);
      void commit(
        ids.map((id) => ({ id, assignee: who })),
        {
          message: `${describeIds(ids)} attribué à ${targetName(who)}`,
          undo: true,
          warn: v.level === "warn" ? v.reasons : undefined,
        },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit, agentName],
  );

  // ---------------------------------------------------------------------------------------------------------------
  // « Attribuer à… »
  const [picker, setPicker] = React.useState<PickerState | null>(null);
  const openPicker = (id: string) => setPicker({ ids: linkedIds(id, ctxRef.current.tasks) });
  const onPick = (ids: string[], a: PlannerAssignee) => {
    const target: DropTarget =
      a.kind === "agent"
        ? { kind: "agent", agentId: a.agentId ?? "" }
        : a.kind === "bcs"
          ? { kind: "bcs", station: a.label ?? "" }
          : { kind: a.kind };
    assignChecked(ids, target, a.kind === "agent" ? agentName(a.agentId ?? "") : a.label);
  };

  // ---------------------------------------------------------------------------------------------------------------
  // Glisser-déposer
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);
  const pendingRefresh = React.useRef(false);

  const verdictsFor = (ids: string[]) => {
    const c = ctxRef.current;
    const m = new Map<string, CheckResult>();
    for (const a of c.agents)
      m.set(`agent:${a.id}`, dropVerdict(ids, { kind: "agent", agentId: a.id }, c));
    for (const b of c.bcs)
      m.set(
        `bcs:${stationKey(b.station)}`,
        dropVerdict(ids, { kind: "bcs", station: b.station }, c),
      );
    m.set("taxi", OK);
    m.set("cdb", OK);
    if (ids.some((id) => c.tasks.find((t) => t.id === id)?.assignee)) m.set("todo", OK);
    return m;
  };
  const targetOfKey = (key: string): DropTarget | null => {
    if (key.startsWith("agent:")) return { kind: "agent", agentId: key.slice(6) };
    if (key.startsWith("bcs:")) {
      const c = ctxRef.current.bcs.find((b) => `bcs:${stationKey(b.station)}` === key);
      return c ? { kind: "bcs", station: c.station } : null;
    }
    if (key === "taxi") return { kind: "taxi" };
    if (key === "cdb") return { kind: "cdb" };
    return null;
  };

  const onDragStart = React.useCallback(
    (e: React.PointerEvent, rawIds: string[], label: string, handle = false) => {
      if (!canWrite || e.button !== 0) return;
      if (e.pointerType === "touch" && !handle) return;
      if (!handle && (e.target as HTMLElement).closest('[data-testid="todo-assign"]')) return;
      const c = ctxRef.current;
      const ids = [...new Set(rawIds.flatMap((id) => linkedIds(id, c.tasks)))];
      const sx = e.clientX;
      const sy = e.clientY;
      let started = false;
      let verdicts = new Map<string, CheckResult>();
      let over: string | null = null;
      let raf = 0;
      let last = { x: sx, y: sy };
      const hit = (x: number, y: number) =>
        (document.elementFromPoint(x, y)?.closest("[data-drop-key]") as HTMLElement | null)?.dataset
          .dropKey ?? null;
      const autoScroll = () => {
        const el = scrollerRef.current;
        if (el && started) {
          const r = el.getBoundingClientRect();
          const edge = 48;
          let dx = 0;
          let dy = 0;
          if (last.x > r.right - edge && last.x < r.right + 8) dx = 14;
          else if (last.x < r.left + HEADER_W + edge && last.x > r.left + HEADER_W - 8) dx = -14;
          if (last.y > r.bottom - edge && last.y < r.bottom + 8) dy = 12;
          else if (last.y < r.top + edge + 36 && last.y > r.top - 8) dy = -12;
          if (dx || dy) el.scrollBy(dx, dy);
        }
        raf = requestAnimationFrame(autoScroll);
      };
      const move = (ev: PointerEvent) => {
        last = { x: ev.clientX, y: ev.clientY };
        if (!started) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
          started = true;
          draggingRef.current = true;
          verdicts = verdictsFor(ids);
          document.documentElement.dataset.plannerDragging = "";
          raf = requestAnimationFrame(autoScroll);
        }
        ev.preventDefault();
        over = hit(ev.clientX, ev.clientY);
        setDrag({ ids, label, x: ev.clientX, y: ev.clientY, over, verdicts });
      };
      const end = (drop: boolean) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("keydown", key, true);
        cancelAnimationFrame(raf);
        delete document.documentElement.dataset.plannerDragging;
        if (!started) return;
        draggingRef.current = false;
        suppressClick.current = true;
        setTimeout(() => (suppressClick.current = false), 0);
        setDrag(null);
        if (drop && over) handleDrop(over, ids, verdicts);
        if (pendingRefresh.current) {
          pendingRefresh.current = false;
          router.refresh();
        }
      };
      const up = () => end(true);
      const cancel = () => end(false);
      const key = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") {
          ev.preventDefault();
          end(false);
        }
      };
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("keydown", key, true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canWrite, router],
  );

  const handleDrop = (key: string, ids: string[], verdicts: Map<string, CheckResult>) => {
    const c = ctxRef.current;
    if (key === "todo") {
      const assigned = ids.filter((id) => c.tasks.find((t) => t.id === id)?.assignee);
      void commit(
        assigned.map((id) => ({ id, assignee: null })),
        { message: `${describeIds(assigned)} remis dans « À attribuer »`, undo: true },
      );
      return;
    }
    const target = targetOfKey(key);
    if (!target || !verdicts.has(key)) return;
    const label =
      target.kind === "agent"
        ? agentName(target.agentId)
        : target.kind === "cdb"
          ? cdbLabel(ids)
          : target.kind === "taxi"
            ? "Taxi"
            : undefined;
    assignChecked(ids, target, label);
  };
  const cdbLabel = (ids: string[]) => {
    const t = ctxRef.current.tasks.find((x) => x.id === ids[0]);
    return t?.train ? `Train ${t.train}` : "Chef de bord";
  };

  // ---------------------------------------------------------------------------------------------------------------
  // Temps réel : une seule connexion SSE (lib/live.ts) ; pas de rechargement pendant un glisser.
  const [live, setLive] = React.useState<LiveState>("connexion");
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = subscribeLive(
      ["planner_tasks"],
      () => {
        if (draggingRef.current) {
          pendingRefresh.current = true;
          return;
        }
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), 300);
      },
      setLive,
    );
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [router]);

  // ---------------------------------------------------------------------------------------------------------------
  // Attribution automatique
  const [auto, setAuto] = React.useState<AutoResult | null>(null);
  const [ignored, setIgnored] = React.useState<Set<string>>(() => new Set());
  const runAuto = () => {
    const c = ctxRef.current;
    const res = autoAssign(c.tasks.filter(isTodo), c);
    setAuto(res);
    setIgnored(new Set());
    setMobileTab("todo");
    if (!res.proposals.length && !res.unassigned.length)
      toast.info("Rien à attribuer pour ce jour.");
  };
  const proposals = React.useMemo(() => {
    const m = new Map<string, PlannerAssignee>();
    if (!auto) return m;
    for (const p of auto.proposals)
      if (!ignored.has(p.taskId) && byId.get(p.taskId) && isTodo(byId.get(p.taskId)!))
        m.set(p.taskId, p.target);
    return m;
  }, [auto, ignored, byId]);
  const acceptProposals = async (ids: string[]) => {
    const items = ids
      .map((id) => ({ id, assignee: proposals.get(id) ?? null }))
      .filter((x): x is { id: string; assignee: PlannerAssignee } => !!x.assignee);
    const n = await commit(items, {
      auto: true,
      undo: true,
      message: `${items.length} ${pl(items.length, "attribution")} ${pl(items.length, "acceptée")}`,
    });
    if (n) setIgnored((s) => new Set([...s, ...ids]));
  };

  // ---------------------------------------------------------------------------------------------------------------
  // Ajout, suppression, doublons
  const [addOpen, setAddOpen] = React.useState(false);
  const submitTasks = async (lines: ManualTaskInput[]) => {
    setBusy(true);
    const r = await createManualTasks(day, lines).catch(() => ({
      ok: false as const,
      error: "Serveur injoignable.",
    }));
    setBusy(false);
    if (!r.ok) {
      toast.error("Ajout refusé", { description: r.error });
      return false;
    }
    toast.success(
      `${r.created} ${pl(r.created, "tâche ajoutée", "tâches ajoutées")} à « À attribuer »`,
    );
    return true;
  };
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const doDelete = async (id: string) => {
    setBusy(true);
    const r = await deleteTask(id).catch(() => ({
      ok: false as const,
      error: "Serveur injoignable.",
    }));
    setBusy(false);
    setConfirmDelete(null);
    if (!r.ok) return void toast.error("Suppression refusée", { description: r.error });
    setSelected(null);
    toast.success("Tâche supprimée");
  };
  const keepDicos = async (manualId: string, dicosId: string) => {
    setBusy(true);
    const r = await resolveDuplicate(
      manualId,
      dicosId,
      updatedOf(manualId),
      updatedOf(dicosId),
    ).catch(() => ({
      ok: false as const,
      error: "Serveur injoignable.",
    }));
    setBusy(false);
    if (!r.ok) return void toast.error("Refusé", { description: r.error });
    setSelected(dicosId);
    toast.success("Saisie supprimée : la tâche DICOS est gardée");
  };

  // ---------------------------------------------------------------------------------------------------------------
  // Affichage
  const [scale, setScale] = React.useState<ScaleId>("normal");
  React.useEffect(() => {
    try {
      const s = localStorage.getItem("csm-planner-scale");
      if (s === "large" || s === "normal" || s === "detail") setScale(s);
    } catch {}
  }, []);
  const changeScale = (s: ScaleId) => {
    setScale(s);
    try {
      localStorage.setItem("csm-planner-scale", s);
    } catch {}
  };
  const px = SCALES[scale];
  const scrollToNow = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const first = ctxRef.current.tasks
      .map((t) => Date.parse(t.start))
      .filter((x) => !Number.isNaN(x))
      .sort((a, b) => a - b)[0];
    const at = now ?? first ?? bounds.start + 2 * 3_600_000;
    const x = xOf(at, bounds, px);
    el.scrollLeft = Math.max(0, x - (el.clientWidth - HEADER_W) * 0.25);
  }, [now, bounds, px]);
  // Ouverture sur « maintenant » (et après un changement d'échelle ou de jour).
  const scrolledFor = React.useRef("");
  React.useEffect(() => {
    const k = `${day}|${px}`;
    if (scrolledFor.current === k) return;
    scrolledFor.current = k;
    scrollToNow();
  }, [day, px, scrollToNow]);

  const [filter, setFilter] = React.useState<TodoFilter>(NO_FILTER);
  const showAgent = React.useCallback(
    (a: PlannerAgent) => agentMatches(a, ctx.tasks, q),
    [ctx.tasks, q],
  );
  const [mobileTab, setMobileTab] = React.useState<"agenda" | "todo">("agenda");
  const [mobileAgent, setMobileAgent] = React.useState("");
  const visibleAgents = React.useMemo(
    () => groups.flatMap((g) => g.agents).filter(showAgent),
    [groups, showAgent],
  );
  const zoneCodes = React.useMemo(() => ctx.bases.map((b) => b.code), [ctx.bases]);
  const selectedTask = selected ? (byId.get(selected) ?? null) : null;
  const dupOf = selected ? dupPairs.find((d) => d.manualId === selected)?.dicosId : undefined;
  const sigs = React.useMemo(() => {
    const o: Record<string, string> = {};
    for (const t of data.tasks) o[t.id] = `${t.updated}|${t.assigneeAgent}|${t.assigneeKind}`;
    return o;
  }, [data.tasks]);

  const todoProps = {
    tasks,
    zones,
    zoneCodes,
    filter,
    onFilter: setFilter,
    duplicates,
    server: adapted.server,
    q,
    now,
    canWrite,
    dropActive: !!drag?.verdicts.has("todo"),
    dropOver: drag?.over === "todo",
    onOpen: open,
    onAssign: openPicker,
    onDragStart,
  };
  const autoProps = auto
    ? {
        result: auto,
        ignored,
        tasks: byId,
        agentName,
        busy,
        onAccept: (ids: string[]) => void acceptProposals(ids),
        onAcceptAll: () => void acceptProposals([...proposals.keys()]),
        onIgnore: (id: string) => setIgnored((s) => new Set([...s, id])),
        onCancel: () => setAuto(null),
        onOther: (id: string, kind: "taxi" | "cdb") =>
          assignChecked(
            linkedIds(id, ctxRef.current.tasks),
            { kind },
            kind === "taxi" ? "Taxi" : cdbLabel([id]),
          ),
        onChoose: (id: string) => openPicker(id),
      }
    : null;
  const ghost = drag ? ghostText(drag, agentName, ctx.bcs) : null;

  return (
    <div
      className="@container/planner flex min-w-0 flex-col gap-3"
      data-hl-scope="planner"
      data-testid="planner"
    >
      <LiveHighlight scope="planner" sigs={sigs} context={day} />
      {/* Barre d'outils : jour, vue, districts, recherche (formulaire du serveur) ; compteurs et actions à droite. */}
      <div className="flex flex-wrap items-center gap-2" data-testid="planner-toolbar">
        {filters}
        <div className="flex flex-wrap items-center gap-2 md:ml-auto">
          <Counters c={counters} />
          {canWrite ? (
            <>
              <Button
                variant="secondary"
                onClick={() => setAddOpen(true)}
                data-shortcut="new"
                className="max-md:hidden"
                data-testid="planner-add"
              >
                <Plus aria-hidden /> Ajouter une tâche
              </Button>
              <Button
                variant="primary"
                onClick={runAuto}
                className="max-md:hidden"
                data-testid="planner-auto"
                disabled={busy}
              >
                <Wand2 aria-hidden /> Attribuer automatiquement
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* Desktop / tablette : Gantt + « À attribuer » */}
      <div className="hidden min-h-0 flex-col gap-3 md:flex @[60rem]/planner:h-[calc(100dvh-12.5rem)] @[60rem]/planner:min-h-[30rem] @[60rem]/planner:flex-row">
        <div className="flex h-[62dvh] min-h-0 min-w-0 flex-1 flex-col gap-2 @[60rem]/planner:h-auto">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-label text-fg-muted">
            <Legend />
            <div className="ml-auto flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5"
                aria-live="polite"
                data-testid="live-state"
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-pill",
                    live === "direct" ? "animate-pulse-dot bg-ok" : "bg-fg-muted",
                  )}
                />
                {live === "direct"
                  ? "En direct"
                  : live === "connexion"
                    ? "Connexion…"
                    : "Hors ligne"}
              </span>
              <div
                role="group"
                aria-label="Échelle"
                className="flex rounded-control bg-surface-2 p-0.5"
              >
                {(
                  [
                    ["large", "Large"],
                    ["normal", "Normal"],
                    ["detail", "Détail"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={scale === id}
                    onClick={() => changeScale(id)}
                    className={cn(
                      "h-control-sm cursor-pointer rounded-control px-3 text-small font-medium",
                      scale === id
                        ? "bg-(--control-on) text-fg shadow-rest ring-1 ring-border-strong"
                        : "text-fg-muted hover:text-fg",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Button variant="secondary" size="sm" onClick={scrollToNow} data-testid="planner-now">
                <Clock aria-hidden /> {now !== null ? "Maintenant" : "Début"}
              </Button>
            </div>
          </div>
          <DayGantt
            ctx={ctx}
            groups={groups}
            serverAgents={serverAgents}
            bounds={bounds}
            px={px}
            now={now}
            day={day}
            timelines={timelines}
            conflicts={conflicts}
            duplicates={duplicates}
            proposals={proposals}
            bcs={ctx.bcs}
            drag={drag ? { verdicts: drag.verdicts, over: drag.over } : null}
            selectedId={selected}
            showAgent={showAgent}
            onOpen={open}
            onDragStart={onDragStart}
            canWrite={canWrite}
            scrollerRef={scrollerRef}
          />
        </div>
        <aside
          aria-label={auto ? "Proposition de répartition" : "À attribuer"}
          className="flex min-h-0 flex-col overflow-hidden rounded-box border border-border bg-surface shadow-rest max-h-[32rem] @[60rem]/planner:max-h-none @[60rem]/planner:w-[22rem] @[60rem]/planner:shrink-0"
          data-testid="planner-aside"
        >
          {autoProps ? (
            <AutoPreview {...autoProps} />
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                <h2 className="flex items-center gap-2 text-body font-semibold">
                  À attribuer
                  <span
                    className="inline-grid h-5 min-w-5 place-items-center rounded-pill bg-[color-mix(in_oklab,var(--warn)_18%,var(--surface))] px-1.5 text-label font-semibold text-fg tabular"
                    data-testid="todo-count"
                  >
                    {counters.toAssign}
                  </span>
                </h2>
                <span className="text-label text-fg-muted">triées par heure</span>
              </div>
              <TodoList {...todoProps} />
            </>
          )}
        </aside>
      </div>

      {/* Mobile : agenda d'un agent et « À attribuer » (pas de glisser au doigt sur un Gantt) */}
      <div className="flex flex-col gap-3 md:hidden" data-testid="planner-mobile">
        <div
          role="tablist"
          aria-label="Vue"
          className="grid grid-cols-2 rounded-control bg-surface-2 p-0.5"
        >
          {(
            [
              ["agenda", "Agenda"],
              ["todo", "À attribuer"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={mobileTab === id}
              onClick={() => setMobileTab(id)}
              className={cn(
                "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-control text-body font-medium",
                mobileTab === id
                  ? "bg-(--control-on) text-fg shadow-rest ring-1 ring-border-strong"
                  : "text-fg-muted",
              )}
            >
              {label}
              {id === "todo" ? (
                <span className="inline-grid h-5 min-w-5 place-items-center rounded-pill bg-[color-mix(in_oklab,var(--warn)_18%,var(--surface))] px-1.5 text-label font-semibold tabular">
                  {counters.toAssign}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {mobileTab === "agenda" ? (
          <MobileAgenda
            agents={visibleAgents}
            agentId={mobileAgent}
            onAgent={setMobileAgent}
            timelines={timelines}
            conflicts={conflicts}
            now={now}
            onOpen={open}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {canWrite ? (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <Button
                  variant="primary"
                  className="h-11"
                  onClick={runAuto}
                  disabled={busy}
                  data-testid="planner-auto-mobile"
                >
                  <Wand2 aria-hidden /> Attribuer automatiquement
                </Button>
                <Button variant="secondary" className="h-11" onClick={() => setAddOpen(true)}>
                  <Plus aria-hidden /> Ajouter
                </Button>
              </div>
            ) : null}
            <div className="flex flex-col overflow-hidden rounded-box border border-border bg-surface">
              {autoProps ? <AutoPreview {...autoProps} /> : <TodoList {...todoProps} mobile />}
            </div>
          </div>
        )}
      </div>

      {ghost ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[60] flex max-w-80 flex-col gap-1"
          style={{ left: drag!.x + 14, top: drag!.y + 14 }}
          data-testid="drag-ghost"
        >
          <span className="w-fit rounded-control border border-border-strong bg-surface px-2 py-1 font-mono text-small font-semibold shadow-float">
            {drag!.label}
          </span>
          {ghost.text ? (
            <span
              className={cn(
                "rounded-control px-2 py-1 text-small text-bg shadow-float",
                ghost.level === "ok" ? "bg-ok" : ghost.level === "warn" ? "bg-warn" : "bg-danger",
              )}
              data-testid="drag-tip"
            >
              {ghost.text}
            </span>
          ) : null}
        </div>
      ) : null}

      <TaskSheet
        task={selectedTask}
        server={selected ? adapted.server.get(selected) : undefined}
        ctx={ctx}
        timelines={timelines}
        zone={selectedTask ? (zones.get(stationKey(selectedTask.station)) ?? "") : ""}
        duplicateOf={dupOf}
        canWrite={canWrite}
        canManage={canManage}
        busy={busy}
        onClose={() => setSelected(null)}
        onOpen={(id) => setSelected(id)}
        onChange={(id) => openPicker(id)}
        onUnassign={(id) =>
          void commit(
            linkedIds(id, ctxRef.current.tasks)
              .filter((x) => ctxRef.current.tasks.find((t) => t.id === x)?.assignee)
              .map((x) => ({ id: x, assignee: null })),
            { message: "Agent retiré : la tâche revient dans « À attribuer »", undo: true },
          )
        }
        onDelete={(id) => setConfirmDelete(id)}
        onResolveDuplicate={(m, d) => void keepDicos(m, d)}
      />
      <AssignPicker state={picker} onClose={() => setPicker(null)} ctx={ctx} onPick={onPick} />
      <AddTaskDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        day={day}
        stations={stationRefs}
        stationOptions={stationOptions}
        busy={busy}
        onSubmit={submitTasks}
      />
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        {confirmDelete ? (
          <DialogContent
            title="Supprimer la tâche ?"
            description="La tâche disparaît du planning. Cette action est définitive."
          >
            <DialogFooter>
              <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
                Garder
              </Button>
              <Button
                variant="danger"
                onClick={() => void doDelete(confirmDelete)}
                loading={busy}
                data-testid="confirm-delete"
              >
                Supprimer
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function ghostText(
  d: DragState,
  agentName: (id: string) => string,
  bcs: { station: string }[],
): { text: string; level: CheckResult["level"] } {
  if (!d.over) return { text: "", level: "ok" };
  if (d.over === "todo") return { text: "Remettre dans « À attribuer »", level: "ok" };
  const v = d.verdicts.get(d.over);
  if (!v) return { text: "", level: "ok" };
  const who = d.over.startsWith("agent:")
    ? agentName(d.over.slice(6))
    : d.over.startsWith("bcs:")
      ? `guichet B-CS ${bcs.find((b) => `bcs:${stationKey(b.station)}` === d.over)?.station ?? ""}`
      : d.over === "taxi"
        ? "taxi"
        : "chef de bord";
  if (v.level === "block")
    return {
      text: isBusyRefusal(v)
        ? `${who} occupé(e) : ${v.reasons[0]} — un autre agent sera proposé`
        : `Refusé : ${v.reasons[0]}`,
      level: "block",
    };
  if (v.level === "warn")
    return { text: `Attribuer à ${who} · attention : ${v.reasons[0]}`, level: "warn" };
  return { text: `Attribuer à ${who}`, level: "ok" };
}

function Counters({ c }: { c: { toAssign: number; conflicts: number; coverage: number } }) {
  const cell =
    "flex items-baseline gap-1.5 whitespace-nowrap px-3 py-1.5 max-md:flex-col max-md:gap-0 max-md:px-2";
  return (
    <div
      className="flex divide-x divide-border overflow-hidden rounded-box border border-border bg-surface text-small shadow-rest max-md:w-full max-md:[&>*]:flex-1"
      data-testid="planner-counters"
    >
      <span className={cell}>
        <b className={cn("figures text-body", c.toAssign ? "text-warn" : "text-fg-subtle")}>
          {c.toAssign}
        </b>
        <span className="text-fg-muted">à attribuer</span>
      </span>
      <span className={cell}>
        <b className={cn("figures text-body", c.conflicts ? "text-danger" : "text-fg-subtle")}>
          {c.conflicts}
        </b>
        <span className="text-fg-muted">{pl(c.conflicts, "conflit")}</span>
      </span>
      <span className={cell}>
        <b className={cn("figures text-body", c.coverage < 100 ? "text-danger" : "text-ok")}>
          {c.coverage} %
        </b>
        <span className="text-fg-muted">couverture</span>
      </span>
    </div>
  );
}

function Legend() {
  const sw = "inline-block h-3 w-1.5 rounded-[2px]";
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Légende">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className={cn(sw, "bg-info")} /> PMR IN (embarquement)
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className={cn(sw, "bg-progress")} /> PMR OUT (débarquement)
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className={cn(sw, "bg-fg-muted")} /> Technique
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block h-3 w-4 rounded-[3px] border border-dashed border-border-strong"
        />{" "}
        Trajet en voiture
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block h-3 w-4 rounded-[3px] bg-[repeating-linear-gradient(135deg,var(--border-strong)_0_1px,transparent_1px_4px)]"
        />
        Hors service
      </li>
    </ul>
  );
}
