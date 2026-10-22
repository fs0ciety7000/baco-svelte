"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// « Synchroniser ce jour » depuis CSM (export ALEA, 22 oct. 2026) : la page parle au script `csm-link.js` de l'extension
// (actif sur toutes les pages CSM depuis la 1.10.0) par postMessage même origine. L'extension lit le jour dans un onglet
// DICOS ouvert et l'envoie à CSM ; la page ne reçoit qu'un résumé chiffré, puis relit ses données.

export type DayExtension =
  | { state: "detecting" }
  | { state: "none" }
  /** Extension installée mais trop ancienne (< 1.10.0) ou non connectée à cette adresse CSM. */
  | { state: "old"; version: string }
  | { state: "unlinked"; version: string }
  | { state: "ready"; version: string };

export type DaySyncResult = {
  ok: boolean;
  code: string;
  error: string;
  missions: number;
  groups: number;
};

type Msg = {
  source?: string;
  type?: string;
  version?: string;
  configured?: boolean;
  sync?: boolean;
  id?: string;
} & Partial<DaySyncResult>;

const SYNC_TIMEOUT = 5 * 60_000;

export function useDicosDaySync(active: boolean) {
  const [ext, setExt] = useState<DayExtension>({ state: "detecting" });
  const [running, setRunning] = useState<string | null>(null);
  const waiter = useRef<{ id: string; resolve: (r: DaySyncResult) => void } | null>(null);

  useEffect(() => {
    if (!active) return;
    const onMessage = (event: MessageEvent<Msg>) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const d = event.data;
      if (!d || d.source !== "csm-dicos-connector") return;
      if (d.type === "hello") {
        const version = String(d.version ?? "").slice(0, 20);
        setExt(
          !d.sync
            ? { state: "old", version }
            : d.configured
              ? { state: "ready", version }
              : { state: "unlinked", version },
        );
      } else if (d.type === "sync-result" && waiter.current && d.id === waiter.current.id) {
        const w = waiter.current;
        waiter.current = null;
        w.resolve({
          ok: d.ok === true,
          code: String(d.code ?? ""),
          error: String(d.error ?? ""),
          missions: Number(d.missions) || 0,
          groups: Number(d.groups) || 0,
        });
      }
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "csm-page", type: "ping" }, window.location.origin);
    const t = window.setTimeout(
      () => setExt((cur) => (cur.state === "detecting" ? { state: "none" } : cur)),
      1500,
    );
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(t);
    };
  }, [active]);

  const sync = useCallback(async (day: string): Promise<DaySyncResult> => {
    const id = Math.random().toString(36).slice(2, 12);
    setRunning(day);
    try {
      return await new Promise<DaySyncResult>((resolve) => {
        const timer = window.setTimeout(() => {
          if (waiter.current?.id !== id) return;
          waiter.current = null;
          resolve({
            ok: false,
            code: "timeout",
            error: "Pas de réponse de l'extension après 5 min.",
            missions: 0,
            groups: 0,
          });
        }, SYNC_TIMEOUT);
        waiter.current = {
          id,
          resolve: (r) => {
            window.clearTimeout(timer);
            resolve(r);
          },
        };
        window.postMessage({ source: "csm-page", type: "sync", day, id }, window.location.origin);
      });
    } finally {
      setRunning(null);
    }
  }, []);

  return { ext, running, sync };
}
