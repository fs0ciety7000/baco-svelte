"use client";

import { MessageSquareText, Train, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { DelayBadge, TrainChip } from "@/components/pmr/train-chip";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/status-badge";
import { ListCard } from "@/components/ui/table";
import {
  delayLabel,
  delayTone,
  type Board,
  type BoardRow,
  type Disturbance,
  type FavoriteStation,
} from "@/lib/ops/irail";
import { CATEGORY, type LogCategory } from "@/lib/ops/log";
import { brusselsTime, pbDate } from "@/lib/orders/time";
import type { ImpactedMission, TodayPmr } from "@/server/data/impacts";
import type { Notification } from "@/server/data/ops";

export type LogDigest = {
  id: string;
  time: string;
  category: LogCategory;
  urgent: boolean;
  pinned: boolean;
  body: string;
  author: string;
};

/** Widget « Journal » : épinglés puis derniers messages. */
export function LogWidget({ entries }: { entries: LogDigest[] | null }) {
  if (!entries) return <EmptyState title="Accès restreint" />;
  if (!entries.length)
    return (
      <EmptyState
        icon={<MessageSquareText className="size-6" />}
        title="Rien de noté"
        description="Aucun message récent dans le journal."
      />
    );
  return (
    <ul className="flex flex-col gap-2">
      {entries.map((e) => (
        <li key={e.id}>
          <Link href={`/operations/journal?entree=${e.id}`} className="block">
            <ListCard
              statusColor={
                e.urgent ? "var(--danger)" : e.pinned ? "var(--accent)" : "var(--border)"
              }
              title={
                <span className="inline-flex min-w-0 items-center gap-2">
                  <span className="font-mono tabular">{e.time}</span>
                  <span className="truncate">{e.body}</span>
                </span>
              }
              meta={`${CATEGORY[e.category].label}${e.pinned ? " · épinglée" : ""} · ${e.author}`}
              aside={e.urgent ? <Badge tone="danger">Urgent</Badge> : undefined}
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Widget « Trains perturbés » : trains supprimés ou à +5 min des 3 premières gares favorites. */
export function TrainsWidget({ favorites }: { favorites: FavoriteStation[] | null }) {
  const [rows, setRows] = useState<(BoardRow & { station: string })[] | null>(null);
  const [error, setError] = useState(false);
  const key = (favorites ?? []).map((f) => f.id).join(",");
  useEffect(() => {
    const list = (favorites ?? []).slice(0, 3);
    if (!list.length) return;
    let cancelled = false;
    const load = async () => {
      try {
        const boards = await Promise.all(
          list.map(async (f) => {
            const res = await fetch(
              `/api/operations/irail/tableau?gare=${encodeURIComponent(f.id)}`,
              { cache: "no-store" },
            );
            if (!res.ok) throw new Error();
            return ((await res.json()) as { board: Board }).board;
          }),
        );
        if (cancelled) return;
        setRows(
          boards
            .flatMap((b) =>
              b.rows
                .filter((r) => r.cancelled || r.delayMin >= 5)
                .map((r) => ({ ...r, station: b.station })),
            )
            .sort((a, b) => a.at - b.at)
            // Un train qui passe par plusieurs gares favorites n'apparaît qu'une fois (premier passage).
            .filter((r, i, all) => all.findIndex((x) => x.train === r.train) === i)
            .slice(0, 8),
        );
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      }
    };
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!favorites) return <EmptyState title="Accès restreint" />;
  if (!favorites.length)
    return (
      <EmptyState
        icon={<Train className="size-6" />}
        title="Aucune gare favorite"
        description="Ajoute tes gares en favori dans Trains en direct (étoile)."
        action={
          <Link href="/operations" className="text-small link">
            Ouvrir les trains en direct
          </Link>
        }
      />
    );
  if (error && !rows) return <p className="text-small text-warn">iRail ne répond pas.</p>;
  if (!rows) return <Skeleton className="h-20 w-full" />;
  if (!rows.length)
    return (
      <EmptyState
        icon={<Train className="size-6" />}
        title="Rien à signaler"
        description={`Aucun retard ≥ 5 min ni suppression à ${favorites
          .slice(0, 3)
          .map((f) => f.name)
          .join(", ")}.`}
      />
    );
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={`${r.station}-${r.train}-${r.at}`}>
          <Link href={`/operations?train=${encodeURIComponent(r.train)}`} className="block">
            <ListCard
              statusColor={
                delayTone(r.delayMin, r.cancelled) === "danger" ? "var(--danger)" : "var(--warn)"
              }
              title={
                <span className="inline-flex items-center gap-2">
                  <span className="font-mono tabular">{brusselsTime(new Date(r.at))}</span>{" "}
                  {r.label} → {r.other}
                </span>
              }
              meta={r.station}
              aside={
                <Badge tone={delayTone(r.delayMin, r.cancelled) === "danger" ? "danger" : "warn"}>
                  <TriangleAlert aria-hidden className="size-3" />{" "}
                  {delayLabel(r.delayMin, r.cancelled)}
                </Badge>
              }
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Les widgets « Perturbations » et « Travaux » lisent la même liste : une seule requête partagée (30 s), sinon chaque
// chargement de l'accueil en faisait deux.
let disturbancesCache: { at: number; promise: Promise<{ items: Disturbance[] }> } | null = null;
function sharedDisturbances(): Promise<{ items: Disturbance[] }> {
  if (disturbancesCache && Date.now() - disturbancesCache.at < 30_000)
    return disturbancesCache.promise;
  const promise = fetch("/api/operations/irail/perturbations", { cache: "no-store" }).then(
    async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { items: Disturbance[] };
    },
  );
  disturbancesCache = { at: Date.now(), promise };
  promise.catch(() => {
    if (disturbancesCache?.promise === promise) disturbancesCache = null;
  });
  return promise;
}

/**
 * Widgets « Perturbations » et « Travaux » (demande du 9 oct. 2026) : messages iRail du réseau, via le relais du
 * serveur CSM (même source que l'onglet Perturbations de /operations). Rechargés toutes les 5 min, onglet visible.
 */
export function DisturbanceWidget({
  kind,
  allowed,
}: {
  kind: Disturbance["kind"];
  allowed: boolean;
}) {
  const [items, setItems] = useState<Disturbance[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await sharedDisturbances();
        if (!cancelled) {
          setItems(data.items);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 300_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [allowed]);
  if (!allowed) return <EmptyState title="Accès restreint" />;
  if (error && !items) return <p className="text-small text-warn">iRail ne répond pas.</p>;
  if (!items) return <Skeleton className="h-20 w-full" />;
  const list = items.filter((d) => d.kind === kind).sort((a, b) => b.at - a.at);
  if (!list.length)
    return (
      <EmptyState
        icon={<TriangleAlert className="size-6" />}
        title="Rien à signaler"
        description={
          kind === "incident" ? "Aucune perturbation en cours." : "Aucun travaux annoncé."
        }
      />
    );
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {list.slice(0, 5).map((d) => (
          <li key={d.id}>
            <ListCard
              statusColor={kind === "incident" ? "var(--danger)" : "var(--warn)"}
              title={d.title}
              meta={d.description}
              aside={
                <Badge tone={kind === "incident" ? "danger" : "warn"}>
                  {brusselsTime(new Date(d.at))}
                </Badge>
              }
            />
          </li>
        ))}
      </ul>
      <Link href="/operations" className="inline-flex min-h-11 items-center text-small link">
        {list.length > 5 ? `Voir les ${list.length} messages` : "Ouvrir les trains en direct"}
      </Link>
    </div>
  );
}

/** Missions PMR / groupes du jour touchées par un retard ou une suppression de leur train (iRail, cron `mission-trains`). */
export function ImpactsWidget({ items }: { items: ImpactedMission[] | null }) {
  if (items === null)
    return <EmptyState title="Accès restreint" description="Tu n'as pas accès aux missions PMR." />;
  if (items.length === 0)
    return (
      <EmptyState
        title="Aucune mission impactée"
        description="Les trains des missions du jour sont à l'heure (iRail, toutes les 3 min)."
      />
    );
  return (
    <ul className="grid gap-2 @3xl:grid-cols-2" data-testid="impacts-widget">
      {items.slice(0, 8).map((m) => (
        <li key={`${m.kind}-${m.id}`} className="min-w-0">
          <Link
            href={m.href}
            className="block rounded-box outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ListCard
              statusColor={
                m.impact.cancelled || m.impact.delay >= 15 ? "var(--danger)" : "var(--warn)"
              }
              title={
                <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
                  <TrainChip train={m.train} />
                  <DelayBadge impact={m.impact} />
                  <span className="min-w-0 truncate">{m.route}</span>
                </span>
              }
              meta={`${m.time || "--:--"} · ${m.detail} · ${m.impact.cancelled ? "supprimé" : "retard"} à ${m.impact.station}`}
              className="hover:bg-surface-2"
            />
          </Link>
        </li>
      ))}
      {items.length > 8 ? (
        <li className="text-small text-fg-muted">+ {items.length - 8} autres</li>
      ) : null}
    </ul>
  );
}

/** Aujourd'hui en PMR : volumes du jour, prochaines prises en charge (districts de l'agent), fraîcheur DICOS. */
export function TodayPmrWidget({ data }: { data: TodayPmr | null }) {
  if (data === null)
    return <EmptyState title="Accès restreint" description="Tu n'as pas accès aux missions PMR." />;
  const age = data.lastSync
    ? Math.round((Date.now() - (pbDate(data.lastSync)?.getTime() ?? Date.now())) / 60000)
    : null;
  return (
    <div className="flex flex-col gap-3" data-testid="today-pmr-widget">
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["Missions PMR", data.missions, "/pmr"],
            ["Groupes", data.groups, "/groupes"],
            ["Impactées", data.impacted, "/pmr"],
          ] as const
        ).map(([label, n, href]) => (
          <Link
            key={label}
            href={href}
            className={cn(
              "flex flex-col gap-0.5 rounded-box border border-border bg-surface-2 px-3 py-2 hover:border-fg-muted",
              label === "Impactées" && n > 0 && "border-warn",
            )}
          >
            <span className="font-mono text-h3 font-semibold tabular">{n}</span>
            <span className="text-small text-fg-muted">{label}</span>
          </Link>
        ))}
      </div>
      <p className={cn("text-small", age === null || age > 60 ? "text-warn" : "text-fg-muted")}>
        {age === null
          ? "Pas encore synchronisé avec DICOS aujourd'hui."
          : `Synchro DICOS il y a ${age < 60 ? `${age} min` : `${Math.floor(age / 60)} h ${String(age % 60).padStart(2, "0")}`}.`}
      </p>
      {data.next.length ? (
        <ul className="flex flex-col gap-1.5">
          {data.next.map((m) => (
            <li key={m.id}>
              <Link
                href={m.href}
                className="flex min-w-0 items-center gap-2 rounded-box px-1 py-1 hover:bg-surface-2"
              >
                <span className="w-12 shrink-0 font-mono text-body tabular">{m.time}</span>
                <TrainChip train={m.train} taxi={m.train === "Taxi"} />
                <DelayBadge impact={m.impact} />
                <Badge tone={m.io === "IN" ? "info" : "ok"}>{m.io}</Badge>
                <span className="min-w-0 flex-1 truncate text-body">{m.station}</span>
                <span className="shrink-0 text-small text-fg-muted max-sm:hidden">{m.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-fg-muted">
          Plus aucune prise en charge prévue aujourd&apos;hui dans tes districts.
        </p>
      )}
    </div>
  );
}

/** Mentions, urgences et alertes non lues (même source que la cloche). */
export function MentionsWidget({ items }: { items: Notification[] | null }) {
  if (items === null) return <EmptyState title="Indisponible" />;
  const unread = items.filter((n) => !n.readAt).slice(0, 6);
  if (!unread.length)
    return <EmptyState title="Rien de nouveau" description="Aucune mention ni alerte non lue." />;
  return (
    <ul className="flex flex-col gap-2" data-testid="mentions-widget">
      {unread.map((n) => (
        <li key={n.id} className="min-w-0">
          <Link
            href={n.link || "/"}
            className="block rounded-box outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ListCard
              statusColor={
                n.kind === "urgent"
                  ? "var(--danger)"
                  : n.kind === "train"
                    ? "var(--warn)"
                    : "var(--info)"
              }
              title={<span className="line-clamp-1">{n.title}</span>}
              meta={`${(() => {
                const d = pbDate(n.created);
                return d ? brusselsTime(d) : "";
              })()} · ${n.body.slice(0, 90)}`}
              className="hover:bg-surface-2"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
