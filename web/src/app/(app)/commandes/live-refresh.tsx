"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Abonnement au relais SSE du serveur CSM (/api/events). À chaque changement, la page serveur est
// relue (router.refresh), regroupé sur 300 ms pour absorber les rafales.
export function LiveRefresh({ topics }: { topics: string[] }) {
  const router = useRouter();
  const [state, setState] = useState<"connexion" | "direct" | "coupé">("connexion");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = topics.join(",");

  useEffect(() => {
    const source = new EventSource(`/api/events?topics=${encodeURIComponent(key)}`);
    source.addEventListener("ready", () => setState("direct"));
    source.addEventListener("change", () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 300);
    });
    source.onerror = () => setState("coupé");
    return () => {
      source.close();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, router]);

  return (
    <span className="font-mono text-xs uppercase" data-testid="live-state" aria-live="polite">
      {state === "direct" ? "● En direct" : state === "connexion" ? "Connexion…" : "Hors ligne"}
    </span>
  );
}
