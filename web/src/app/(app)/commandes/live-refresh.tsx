"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { subscribeLive } from "@/lib/live";

// Abonnement au relais SSE du serveur CSM (/api/events). À chaque changement, la page serveur est
// relue (router.refresh), regroupé sur 300 ms pour absorber les rafales.
export function LiveRefresh({ topics }: { topics: string[] }) {
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
      className="label-mono inline-flex items-center gap-2 text-fg-muted"
      data-testid="live-state"
      aria-live="polite"
    >
      <span
        aria-hidden
        className={state === "direct" ? "size-1.5 animate-pulse-dot bg-ok" : "size-1.5 bg-fg-muted"}
      />
      {state === "direct" ? "En direct" : state === "connexion" ? "Connexion…" : "Hors ligne"}
    </span>
  );
}
