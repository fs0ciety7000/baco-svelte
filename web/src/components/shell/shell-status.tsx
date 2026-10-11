"use client";

import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";

import { type ShellStatus, shellStatus } from "@/app/shell-actions";
import { type LiveState, subscribeLive } from "@/lib/live";

// Compteurs de la barre latérale et état des flux (11 oct. 2026). Une seule lecture partagée par onglet : relue au
// changement en direct (regroupé sur 2 s), toutes les 60 s, et au retour sur l'onglet ; rien quand l'onglet est caché.

type Value = { status: ShellStatus | null; live: LiveState };
const Ctx = createContext<Value>({ status: null, live: "connexion" });

const TOPICS = [
  "bus_orders",
  "taxi_orders",
  "ops_log",
  "ops_log_reads",
  "mission_trains",
  "dicos_syncs",
];

export function ShellStatusProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<ShellStatus | null>(null);
  const [live, setLive] = useState<LiveState>("connexion");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      shellStatus()
        .then((s) => {
          if (alive && s) setStatus(s);
        })
        .catch(() => {});
    };
    const soon = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(load, 2000);
    };
    load();
    const every = setInterval(load, 60_000);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    const off = subscribeLive(TOPICS, soon, setLive);
    return () => {
      alive = false;
      clearInterval(every);
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
      off();
    };
  }, [enabled]);

  return <Ctx.Provider value={{ status, live }}>{children}</Ctx.Provider>;
}

export function useShellStatus(): Value {
  return useContext(Ctx);
}
