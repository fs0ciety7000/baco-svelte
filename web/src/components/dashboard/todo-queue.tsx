"use client";

import {
  AtSign,
  Check,
  Pin,
  Radio,
  RefreshCw,
  RotateCcw,
  Send,
  TrainFront,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";

import { markNotifications } from "@/app/(app)/operations/actions";
import { markTodoSeen } from "@/app/dashboard-actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { TrainChip } from "@/components/ui/train-chip";
import { splitSeen } from "@/lib/dashboard/todo-seen";
import { safeCall } from "@/lib/orders/safe-call";
import { cn, pl } from "@/lib/utils";

import {
  groupTodo,
  primaryTodo,
  type Severity,
  type TodoGroup,
  type TodoItem,
  type TodoKind,
} from "./todo";

// File « À traiter » de l'accueil (rendu client). Logique pure dans `todo.tsx` (testée) ; ici l'affichage et le « Vu »
// (4 nov. 2026) : une alerte sans traitement possible (train supprimé, retard, consigne, notification) se masque pour
// l'agent seul, avec « Annuler » ; les bons à envoyer n'ont pas de « Vu » (c'est du travail à faire).

const ICON: Record<TodoKind, LucideIcon> = {
  impact: TriangleAlert,
  send: Send,
  urgent: Radio,
  mention: AtSign,
  dicos: RefreshCw,
  consigne: Pin,
  perturbation: TrainFront,
};
const TONE: Record<Severity, string> = {
  danger: "var(--danger)",
  warn: "var(--warn)",
  info: "var(--info)",
  neutral: "var(--fg-muted)",
};
const GROUP_DOT: Record<TodoGroup, string> = {
  urgent: "bg-danger",
  today: "bg-warn",
  info: "bg-info",
};

const SHOWN = 8;

/** Clé locale d'un élément masquable (`null` = pas de « Vu »). */
function dismissId(it: TodoItem): string | null {
  return it.seenKey ?? (it.notifId ? `notif:${it.notifId}` : null);
}

export function TodoQueue({ items, seen }: { items: TodoItem[]; seen: readonly string[] }) {
  const router = useRouter();
  // Choix faits dans cet onglet (clé → masqué ?), prioritaires sur les préférences lues au chargement : affichage immédiat.
  const [over, setOver] = useState<Record<string, boolean>>({});
  const [showSeen, setShowSeen] = useState(false);
  const { visible, hidden } = useMemo(() => {
    const set = new Set(seen);
    for (const [k, v] of Object.entries(over)) {
      if (v) set.add(k);
      else set.delete(k);
    }
    // Les notifications marquées lues sortent de la liste au rafraîchissement suivant ; d'ici là, cachées localement.
    const keyed = items.map((it) => ({ it, seenKey: dismissId(it) ?? undefined }));
    const parts = splitSeen(keyed, set);
    return { visible: parts.visible.map((x) => x.it), hidden: parts.hidden.map((x) => x.it) };
  }, [items, seen, over]);

  // Préférences = lire-modifier-écrire : un « Vu » à la fois (deux appels simultanés s'écraseraient).
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(job, job);
    queue.current = next.catch(() => undefined);
    return next;
  }, []);

  const setSeen = useCallback(
    async (it: TodoItem, value: boolean, undoable: boolean) => {
      const k = dismissId(it);
      if (!k) return;
      setOver((o) => ({ ...o, [k]: value }));
      const res = await enqueue(() =>
        safeCall(
          it.notifId
            ? markNotifications({ ids: [it.notifId], unread: !value })
            : markTodoSeen(it.seenKey!, value),
        ),
      );
      if (!res.ok) {
        setOver((o) => {
          const n = { ...o };
          delete n[k];
          return n;
        });
        toast.error(res.error);
        return;
      }
      // Notification : la cloche et la liste se relisent (lue ou de nouveau non lue).
      if (it.notifId) router.refresh();
      if (value && undoable)
        toast("Masqué de ta file « À traiter »", {
          description: "Il reviendra si la situation s'aggrave.",
          action: { label: "Annuler", onClick: () => void setSeen(it, false, false) },
        });
    },
    [enqueue, router],
  );

  const shown = visible.slice(0, SHOWN);
  const primary = primaryTodo(shown);
  return (
    <Card data-compact-empty data-testid="todo-queue" className="min-w-0">
      <CardHeader title="À traiter" count={visible.length || undefined} className="pb-1" />
      {shown.length === 0 ? (
        <div className="p-3 pt-2">
          <EmptyState title="Rien à traiter pour l'instant" />
        </div>
      ) : (
        <div className="flex flex-col pb-1.5">
          {groupTodo(shown).map((g) => (
            <section key={g.id} aria-labelledby={`todo-${g.id}`} data-testid={`todo-group-${g.id}`}>
              <h4
                id={`todo-${g.id}`}
                className="flex items-center gap-2 px-4 pt-3 pb-1 text-label font-medium tracking-normal text-fg-subtle"
              >
                <span aria-hidden className={cn("size-1.5 rounded-pill", GROUP_DOT[g.id])} />
                {g.label}
              </h4>
              <ul className="divide-y divide-[color-mix(in_oklab,var(--border)_70%,transparent)]">
                {g.items.map((it) => (
                  <TodoRow
                    key={it.key}
                    it={it}
                    primary={it.key === primary}
                    onSeen={dismissId(it) ? () => void setSeen(it, true, true) : undefined}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {visible.length > shown.length ? (
        <p className="border-t border-border px-4 py-2 text-small text-fg-muted">
          Et {visible.length - shown.length} de plus :{" "}
          <Link href="/operations/b201" className="link">
            B201
          </Link>{" "}
          et{" "}
          <Link href="/commandes/suivi" className="link">
            suivi des bons
          </Link>
          .
        </p>
      ) : null}
      {hidden.length ? (
        <div className="border-t border-border" data-testid="todo-seen">
          <button
            type="button"
            aria-expanded={showSeen}
            onClick={() => setShowSeen((v) => !v)}
            className="flex min-h-11 w-full cursor-pointer items-center px-4 text-left text-small text-fg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            {showSeen
              ? "Masquer les éléments vus"
              : `Afficher ${hidden.length} ${pl(hidden.length, "élément")} ${pl(hidden.length, "vu")}`}
          </button>
          {showSeen ? (
            <ul className="divide-y divide-[color-mix(in_oklab,var(--border)_70%,transparent)] pb-1.5 opacity-75">
              {hidden.map((it) => (
                <TodoRow
                  key={it.key}
                  it={it}
                  primary={false}
                  onRestore={() => void setSeen(it, false, false)}
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function TodoRow({
  it,
  primary,
  onSeen,
  onRestore,
}: {
  it: TodoItem;
  primary: boolean;
  /** « Vu » : masque l'élément pour l'agent (absent = vrai travail, pas masquable). */
  onSeen?: () => void;
  /** Élément déjà vu : le remettre dans la file. */
  onRestore?: () => void;
}) {
  const Icon = ICON[it.kind];
  return (
    <li
      data-testid="todo-item"
      data-group={it.group}
      style={{ "--tone": TONE[it.severity] } as React.CSSProperties}
      className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:grid-cols-[2rem_minmax(0,1fr)_auto]"
    >
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-box bg-[color-mix(in_oklab,var(--tone)_var(--tint,12%),var(--surface))] text-(--tone) [&_svg]:size-4"
      >
        <Icon />
      </span>
      <div className="min-w-0">
        <p className="line-clamp-2 text-body font-medium text-fg sm:truncate">{it.title}</p>
        <p className="flex min-w-0 items-center gap-2 text-small text-fg-muted">
          {it.train ? <TrainChip train={it.train} size="sm" /> : null}
          {it.delay ? (
            <span
              className={cn(
                "shrink-0 font-mono font-medium whitespace-nowrap tabular",
                it.delay.tone === "danger" ? "text-danger" : "text-warn",
              )}
            >
              {it.delay.label}
            </span>
          ) : null}
          {it.code ? <span className="shrink-0 font-mono text-fg tabular">{it.code}</span> : null}
          <span className="truncate">{it.detail}</span>
        </p>
      </div>
      <div className="col-start-2 flex items-center justify-between gap-3 sm:col-start-auto sm:justify-start">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button asChild size="sm" variant={primary ? "primary" : "secondary"}>
            <Link href={it.href} data-testid="todo-action">
              {it.action}
            </Link>
          </Button>
          {onSeen ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onSeen}
              data-testid="todo-seen-button"
              aria-label={`Vu, masquer : ${it.title}`}
              title="Vu : masquer de ma file (revient si la situation s'aggrave)"
            >
              <Check aria-hidden /> Vu
            </Button>
          ) : null}
          {onRestore ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRestore}
              data-testid="todo-restore-button"
              aria-label={`Remettre dans la file : ${it.title}`}
            >
              <RotateCcw aria-hidden /> Remettre
            </Button>
          ) : null}
        </div>
        {it.when ? (
          <span className="w-12 shrink-0 text-right font-mono text-label text-fg-subtle tabular sm:w-11">
            {it.when}
          </span>
        ) : null}
      </div>
    </li>
  );
}
