"use client";

import { MessageSquareText, Train, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Badge } from "@/components/ui/status-badge";
import { ListCard } from "@/components/ui/table";
import {
  delayLabel,
  delayTone,
  type Board,
  type BoardRow,
  type FavoriteStation,
} from "@/lib/ops/irail";
import { CATEGORY, type LogCategory } from "@/lib/ops/log";
import { brusselsTime } from "@/lib/orders/time";

export type LogDigest = {
  id: string;
  time: string;
  category: LogCategory;
  urgent: boolean;
  pinned: boolean;
  body: string;
  author: string;
};

/** Widget « Main courante » : épinglées puis dernières entrées. */
export function LogWidget({ entries }: { entries: LogDigest[] | null }) {
  if (!entries) return <EmptyState title="Accès restreint" />;
  if (!entries.length)
    return (
      <EmptyState
        icon={<MessageSquareText className="size-6" />}
        title="Rien de noté"
        description="Aucune entrée récente dans la main courante."
      />
    );
  return (
    <ul className="flex flex-col gap-2">
      {entries.map((e) => (
        <li key={e.id}>
          <Link href={`/operations/main-courante?entree=${e.id}`} className="block">
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
        description="Ajoutez vos gares en favori dans Trains en direct (étoile)."
        action={
          <Link
            href="/operations"
            className="text-small text-accent underline-offset-2 hover:underline"
          >
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
