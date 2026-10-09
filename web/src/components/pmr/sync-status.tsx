"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { pbDate } from "@/lib/orders/time";
import { cn } from "@/lib/utils";

const STALE_MIN = 60;

function ago(min: number): string {
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h ${String(min % 60).padStart(2, "0")}`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

/**
 * Fraîcheur des données DICOS (audit UX du 9 oct. 2026) : « Synchronisé il y a X min », en alerte au-delà d'une heure
 * ou si aucun jour de la période n'a été synchronisé (l'ALEA ne doit pas partir d'une liste périmée).
 */
export function SyncStatus({ lastAt, covered }: { lastAt: string | null; covered: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const at = lastAt ? pbDate(lastAt)?.getTime() : undefined;
  const min = at && now ? Math.max(0, Math.floor((now - at) / 60_000)) : null;
  const stale = !covered || !at || (min !== null && min > STALE_MIN);
  return (
    <p
      data-testid="dicos-sync"
      data-stale={stale || undefined}
      className={cn(
        "inline-flex items-center gap-1.5 text-small",
        stale ? "text-warn" : "text-fg-muted",
      )}
      title={at ? new Date(at).toLocaleString("fr-BE") : undefined}
    >
      {stale ? (
        <TriangleAlert aria-hidden className="size-3.5" />
      ) : (
        <RefreshCw aria-hidden className="size-3.5" />
      )}
      {!at
        ? "Jamais synchronisé avec DICOS"
        : !covered
          ? `Période pas encore synchronisée (dernière synchro DICOS ${min === null ? "" : ago(min)})`
          : `Synchronisé avec DICOS ${min === null ? "" : ago(min)}`}
      {stale ? (
        <Link href="/pmr/extension" className="link ml-1">
          Extension DICOS
        </Link>
      ) : null}
    </p>
  );
}
