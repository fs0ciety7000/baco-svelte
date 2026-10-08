"use client";

import { Check, History, Pencil, Undo2, XCircle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { loadEntryPanel, restoreEntry, retireEntry, setRead } from "@/app/(app)/operations/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Timeline } from "@/components/ui/form-kit";
import { Textarea } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { CATEGORY, RETIRE_WINDOW_MS, type LogCategory } from "@/lib/ops/log";
import { safeCall } from "@/lib/orders/safe-call";
import { pbDate } from "@/lib/orders/time";
import { cn } from "@/lib/utils";
import type { Agent, LinkedObject, LogEntry, LogEvent } from "@/server/data/ops";

import { LogComposer } from "./log-composer";
import { LogBody, LogLinks, LogMeta, ReadState } from "./log-entry";

const toneVar: Record<string, string> = {
  danger: "var(--danger)",
  info: "var(--info)",
  accent: "var(--accent)",
  warn: "var(--warn)",
  ok: "var(--ok)",
  neutral: "var(--border-strong)",
};

const stamp = new Intl.DateTimeFormat("fr-BE", {
  timeZone: "Europe/Brussels",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const FIELD: Record<string, string> = {
  body: "Texte",
  category: "Catégorie",
  occurred_at: "Heure de l'événement",
  urgent: "Urgent",
  pinned_until: "Épinglage",
  train: "Train",
  bus_order: "Bus lié",
  taxi_order: "Taxi lié",
  pmr_assist: "Prestation liée",
  level_crossing: "PN lié",
  attachments: "Pièces jointes",
  district: "District",
};

function eventTitle(e: LogEvent) {
  if (e.kind === "create") return "Publication";
  if (e.kind === "retire") return "Retirée";
  if (e.kind === "restore") return "Rétablie";
  if (e.field === "category")
    return `Catégorie : ${CATEGORY[e.from as LogCategory]?.label ?? e.from} → ${CATEGORY[e.to as LogCategory]?.label ?? e.to}`;
  if (e.field === "body") return "Texte corrigé";
  return `${FIELD[e.field] ?? e.field} modifié`;
}

/** Fil de la main courante : cartes d'entrées, « Lu », panneau (historique, modification, retrait). */
export function LogBoard({
  rows,
  pinned,
  me,
  coordinator,
  canWrite,
  agents,
  linkKinds,
  showDay,
}: {
  rows: LogEntry[];
  pinned: LogEntry[];
  me: string;
  coordinator: boolean;
  canWrite: boolean;
  agents: Agent[];
  linkKinds: LinkedObject["kind"][];
  showDay: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(params.get("entree"));
  const [panel, setPanel] = useState<{ entry: LogEntry; events: LogEvent[] } | null>(null);
  const [editing, setEditing] = useState(false);
  const [retiring, setRetiring] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const wanted = useRef<string | null>(null);

  const load = useCallback(async (id: string) => {
    wanted.current = id;
    const res = await safeCall(loadEntryPanel(id));
    if (wanted.current !== id) return;
    if (res.ok) setPanel(res.data);
    else {
      toast.error(res.error);
      setOpenId(null);
    }
  }, []);
  useEffect(() => {
    if (openId) void load(openId);
  }, [openId, load]);
  // Lien de notification vers la page déjà ouverte (navigation douce) : ouvre l'entrée demandée.
  const wantedEntry = params.get("entree");
  useEffect(() => {
    if (wantedEntry && wantedEntry !== openId) {
      setPanel(null);
      setEditing(false);
      setOpenId(wantedEntry);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedEntry]);
  const openUpdated = openId
    ? [...rows, ...pinned].find((r) => r.id === openId)?.updated
    : undefined;
  useEffect(() => {
    if (openId && openUpdated && !editing) void load(openId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openUpdated]);

  const open = (id: string) => {
    setPanel(null);
    setEditing(false);
    setOpenId(id);
    const sp = new URLSearchParams(params.toString());
    sp.set("entree", id);
    window.history.replaceState(null, "", `${pathname}?${sp}`);
  };
  const close = () => {
    setOpenId(null);
    setPanel(null);
    setEditing(false);
    wanted.current = null;
    const sp = new URLSearchParams(params.toString());
    sp.delete("entree");
    window.history.replaceState(null, "", sp.size ? `${pathname}?${sp}` : pathname);
  };

  const toggleRead = (e: LogEntry) =>
    start(async () => {
      const read = !e.readers.some((r) => r.id === me);
      const res = await safeCall(setRead({ id: e.id, read }));
      if (!res.ok) return void toast.error(res.error);
      router.refresh();
      if (openId === e.id) void load(e.id);
    });

  const e = panel?.entry;
  const isAuthor = !!e && e.authorId === me;
  const canEdit = !!e && canWrite && e.status === "active" && (isAuthor || coordinator);
  const withinWindow = !!e && Date.now() - (pbDate(e.created)?.getTime() ?? 0) < RETIRE_WINDOW_MS;
  const canRetire =
    !!e && canWrite && e.status === "active" && (coordinator || (isAuthor && withinWindow));

  const card = (r: LogEntry) => (
    <li key={r.id}>
      <article
        style={{ "--status": toneVar[CATEGORY[r.category].tone] } as React.CSSProperties}
        className={cn(
          "flex flex-col gap-2 border border-border border-l-[3px] border-l-(--status) bg-surface px-4 py-3",
          r.urgent &&
            r.status === "active" &&
            "bg-[color-mix(in_oklab,var(--danger)_6%,var(--surface))]",
          r.status === "retiree" && "opacity-70",
        )}
        aria-label={`Entrée de ${r.authorName}`}
      >
        <div className="flex items-start justify-between gap-2">
          <LogMeta entry={r} showDay={showDay} />
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0"
            onClick={() => open(r.id)}
            aria-label={`Ouvrir l'entrée de ${r.authorName}`}
            data-testid="log-open"
          >
            <History aria-hidden /> <span className="hidden sm:inline">Détail</span>
          </Button>
        </div>
        <LogBody body={r.body} className={r.status === "retiree" ? "line-through" : ""} />
        {r.status === "retiree" && r.retiredReason ? (
          <p className="text-small text-fg-muted">Motif du retrait : {r.retiredReason}</p>
        ) : null}
        <LogLinks entry={r} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ReadState entry={r} me={me} />
          {r.status === "active" ? (
            <Button
              size="sm"
              variant={r.readers.some((x) => x.id === me) ? "ghost" : "secondary"}
              onClick={() => toggleRead(r)}
              disabled={pending}
              data-testid="log-read"
            >
              <Check aria-hidden /> {r.readers.some((x) => x.id === me) ? "Lu" : "Marquer lu"}
            </Button>
          ) : null}
        </div>
      </article>
    </li>
  );

  return (
    <>
      {pinned.length ? (
        <section aria-label="Consignes épinglées" className="flex flex-col gap-2">
          <h2 className="label-mono text-fg-muted">Consignes épinglées · {pinned.length}</h2>
          <ul className="flex flex-col gap-2" data-testid="log-pinned">
            {pinned.map(card)}
          </ul>
        </section>
      ) : null}
      <section aria-label="Fil de la main courante" className="flex flex-col gap-2">
        {rows.filter((r) => !pinned.some((p) => p.id === r.id)).length === 0 && !pinned.length ? (
          <EmptyState
            title="Aucune entrée"
            description="Rien n'a été noté pour ce jour ou ces filtres."
          />
        ) : (
          <ul className="flex flex-col gap-2" data-testid="log-list">
            {rows.filter((r) => !pinned.some((p) => p.id === r.id)).map(card)}
          </ul>
        )}
      </section>

      <Sheet
        open={!!openId}
        onOpenChange={(o) => (o ? null : close())}
        eyebrow="// Main courante"
        title={e ? `${CATEGORY[e.category].label} · ${e.authorName}` : "Entrée"}
        description={e?.status === "retiree" ? "Entrée retirée" : undefined}
        footer={
          e ? (
            <div className="flex w-full flex-wrap gap-2">
              {canEdit && !editing ? (
                <Button size="sm" onClick={() => setEditing(true)} data-testid="log-edit">
                  <Pencil aria-hidden /> Modifier
                </Button>
              ) : null}
              {canRetire && !editing ? (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setRetiring(true)}
                  data-testid="log-retire"
                >
                  <XCircle aria-hidden /> Retirer
                </Button>
              ) : null}
              {e.status === "retiree" && coordinator && canWrite ? (
                <Button
                  size="sm"
                  onClick={() =>
                    start(async () => {
                      const res = await safeCall(restoreEntry(e.id));
                      if (!res.ok) return void toast.error(res.error);
                      toast.success("Entrée rétablie.");
                      router.refresh();
                      void load(e.id);
                    })
                  }
                >
                  <Undo2 aria-hidden /> Rétablir
                </Button>
              ) : null}
              {editing ? (
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Annuler la modification
                </Button>
              ) : null}
            </div>
          ) : null
        }
      >
        {!e ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : editing ? (
          <LogComposer
            key={e.id}
            agents={agents}
            linkKinds={linkKinds}
            entry={e}
            onChanged={() => void load(e.id)}
            onDone={() => {
              setEditing(false);
              void load(e.id);
            }}
          />
        ) : (
          <div className="flex flex-col gap-4" data-testid="log-panel">
            <LogMeta entry={e} showDay />
            <LogBody body={e.body} />
            {e.status === "retiree" ? (
              <p className="text-small text-fg-muted">
                Motif du retrait : {e.retiredReason || "—"}
              </p>
            ) : null}
            <LogLinks entry={e} />
            <div className="flex flex-col gap-1">
              <h3 className="label-mono text-fg-muted">Lu par</h3>
              <p className="text-body">
                {e.readers.length
                  ? e.readers.map((r) => r.name).join(", ")
                  : "Personne pour l'instant."}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="label-mono text-fg-muted">Historique</h3>
              <Timeline
                items={(panel?.events ?? []).map((ev) => ({
                  id: ev.id,
                  title: eventTitle(ev),
                  meta: `${ev.by} · ${stamp.format(pbDate(ev.at) ?? new Date())}`,
                  note: ev.note || (ev.field === "body" ? undefined : undefined),
                  color:
                    ev.kind === "retire"
                      ? "var(--danger)"
                      : ev.kind === "create"
                        ? "var(--info)"
                        : "var(--fg-muted)",
                }))}
              />
            </div>
          </div>
        )}
      </Sheet>

      <Dialog open={retiring} onOpenChange={(o) => (setRetiring(o), o ? null : setReason(""))}>
        <DialogContent
          title="Retirer l'entrée"
          description="L'entrée reste conservée et visible des coordinateurs, avec le motif."
        >
          <Field label="Motif" required>
            <Textarea
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
              maxLength={500}
              rows={3}
            />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRetiring(false)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              disabled={!reason.trim() || pending}
              onClick={() =>
                start(async () => {
                  if (!e) return;
                  const res = await safeCall(retireEntry({ id: e.id, reason }));
                  if (!res.ok) return void toast.error(res.error);
                  toast.success("Entrée retirée.");
                  setRetiring(false);
                  setReason("");
                  router.refresh();
                  void load(e.id);
                })
              }
            >
              Retirer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
