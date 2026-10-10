"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { formatShortDay, pbDate } from "@/lib/orders/time";
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
export function SyncStatus({
  lastAt,
  covered,
  partialAt = null,
  by = null,
  missing = [],
}: {
  lastAt: string | null;
  covered: boolean;
  /** Dernier envoi de la période sans son dernier lot : synchro en cours ou interrompue. */
  partialAt?: string | null;
  by?: string | null;
  /** Jours de la période sans synchro complète. */
  missing?: string[];
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const minutesSince = (iso: string | null) => {
    const t = iso ? pbDate(iso)?.getTime() : undefined;
    return t && now ? Math.max(0, Math.floor((now - t) / 60_000)) : null;
  };
  const at = lastAt ? pbDate(lastAt)?.getTime() : undefined;
  const min = minutesSince(lastAt);
  const partialMin = minutesSince(partialAt);
  // Lots envoyés il y a moins de 3 min : la synchro tourne encore ; au-delà, elle s'est arrêtée en route.
  // Avant l'hydratation (heure inconnue), on ne crie pas à l'échec : « en cours » le temps du premier rendu.
  const running = partialAt !== null && (partialMin === null || partialMin < 3);
  const interrupted = partialAt !== null && !running;
  const stale = interrupted || (!running && (!covered || !at || (min !== null && min > STALE_MIN)));
  const byText = by ? ` par ${by}` : "";
  return (
    <p
      data-testid="dicos-sync"
      data-stale={stale || undefined}
      data-partial={partialAt ? (running ? "running" : "interrupted") : undefined}
      className={cn(
        "inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-small",
        stale ? "text-warn" : "text-fg-muted",
      )}
      title={at ? new Date(at).toLocaleString("fr-BE") : undefined}
    >
      {stale ? (
        <TriangleAlert aria-hidden className="size-3.5" />
      ) : (
        <RefreshCw aria-hidden className={cn("size-3.5", running && "animate-spin")} />
      )}
      {!at
        ? "Jamais synchronisé avec DICOS"
        : running
          ? `Synchro DICOS en cours${byText}…`
          : interrupted
            ? `Synchro DICOS incomplète (arrêtée ${partialMin === null ? "" : ago(partialMin)}${byText}) : relance-la`
            : !covered
              ? missing.length && missing.length <= 3
                ? `Pas encore synchronisé : ${missing.map((d) => formatShortDay(d)).join(", ")}`
                : `Période pas encore entièrement synchronisée${missing.length ? ` (${missing.length} jours manquants)` : ""}`
              : `Synchronisé avec DICOS ${min === null ? "" : ago(min)}${byText}`}
      {stale ? (
        <Link href="/pmr/extension" className="link ml-1">
          Extension DICOS
        </Link>
      ) : null}
    </p>
  );
}
