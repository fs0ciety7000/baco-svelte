"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { subscribeLive } from "@/lib/live";
import { cn } from "@/lib/utils";

// Abonnement au relais SSE du serveur CSM (/api/events). À chaque changement, la page serveur est
// relue (router.refresh), regroupé sur 300 ms pour absorber les rafales.
// `quiet` (accueil, 11 oct. 2026) : rien de visible tant que le flux est en direct (l'état est dans la barre latérale),
// seulement « Connexion… » / « Hors ligne ».
export function LiveRefresh({
  topics,
  quiet,
  compact,
}: {
  topics: string[];
  quiet?: boolean;
  /** Mobile : pastille seule, libellé pour les lecteurs d'écran (décision du 15 oct. 2026). */
  compact?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<"connexion" | "direct" | "coupé">("connexion");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = topics.join(",");

  useEffect(() => {
    // Flux partagé (une seule connexion SSE par onglet, voir lib/live.ts).
    const off = subscribeLive(
      key.split(","),
      () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => router.refresh(), 300);
      },
      setState,
    );
    return () => {
      off();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, router]);

  return (
    <span
      className={
        quiet && state === "direct"
          ? "sr-only"
          : "label-mono inline-flex items-center gap-2 text-fg-muted"
      }
      data-testid="live-state"
      aria-live="polite"
    >
      <span
        aria-hidden
        className={state === "direct" ? "size-1.5 animate-pulse-dot bg-ok" : "size-1.5 bg-fg-muted"}
      />
      {/* Largeur du libellé le plus long réservée (lot 5) : « Connexion… » au rendu serveur puis « En direct » ne fait
          plus changer la rangée de place (CLS de Ma journée en 390 px). */}
      <span
        className={cn(
          compact && "max-md:sr-only",
          "inline-grid before:invisible before:content-['Connexion…'] before:[grid-area:1/1] after:invisible after:content-['Hors_ligne'] after:[grid-area:1/1]",
        )}
      >
        <span className="[grid-area:1/1]">
          {state === "direct" ? "En direct" : state === "connexion" ? "Connexion…" : "Hors ligne"}
        </span>
      </span>
    </span>
  );
}
