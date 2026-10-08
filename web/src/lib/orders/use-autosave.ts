"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { SaveState } from "@/components/ui/form-kit";

type SaveResult =
  | { ok: true; data: { id: string; number: number; updated: string } }
  | { ok: false; error: string };

/**
 * Enregistrement automatique d'un brouillon (audit UX C5) : 1,2 s après la dernière saisie, une requête à la
 * fois, verrou optimiste (`updated`). La 1re sauvegarde crée la commande et remplace l'URL sans recharger.
 */
export function useAutosave<T>({
  value,
  enabled,
  initialId,
  initialUpdated,
  save,
  onCreated,
  delay = 1200,
}: {
  value: T;
  enabled: boolean;
  initialId: string | null;
  initialUpdated: string | null;
  save: (id: string | null, value: T, expectedUpdated?: string) => Promise<SaveResult>;
  onCreated?: (id: string, number: number) => void;
  delay?: number;
}) {
  const [state, setState] = useState<SaveState>(initialId ? "saved" : "idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [number, setNumber] = useState<number | null>(null);
  const id = useRef(initialId);
  const updated = useRef(initialUpdated ?? undefined);
  const last = useRef(JSON.stringify(value));
  const latest = useRef(value);
  const inflight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  latest.current = value;

  const run = useCallback(
    async (create = false): Promise<boolean> => {
      // Une requête à la fois : on attend celle en cours, puis on recontrôle (le minuteur et `flush` peuvent
      // attendre la même requête).
      while (inflight.current) await inflight.current;
      const snapshot = latest.current;
      const json = JSON.stringify(snapshot);
      // Rien de saisi : pas de requête, sauf création demandée (« Préparer l'envoi » d'un modèle chargé tel quel).
      if (json === last.current && (id.current || !create)) return true;
      const p = (async () => {
        setState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "saving");
        let res: SaveResult;
        try {
          res = await save(id.current, snapshot, updated.current);
        } catch {
          // Réseau coupé ou serveur redéployé (« Failed to find Server Action ») : la saisie reste à l'écran.
          setState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
          setError(
            "Enregistrement impossible (réseau ou mise à jour du serveur) : la saisie est gardée, réessayez.",
          );
          return false;
        }
        if (!res.ok) {
          setState("error");
          setError(res.error);
          return false;
        }
        const created = !id.current;
        id.current = res.data.id;
        updated.current = res.data.updated;
        last.current = json;
        setNumber(res.data.number);
        setError(null);
        setSavedAt(new Date());
        setState(JSON.stringify(latest.current) === json ? "saved" : "dirty");
        if (created) onCreated?.(res.data.id, res.data.number);
        return true;
      })();
      inflight.current = p;
      try {
        return await p;
      } finally {
        inflight.current = null;
      }
    },
    [save, onCreated],
  );

  // Retour du réseau : nouvel essai.
  useEffect(() => {
    if (!enabled) return;
    const retry = () => void run();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [enabled, run]);

  useEffect(() => {
    if (!enabled) return;
    const json = JSON.stringify(value);
    if (json === last.current) return;
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void run();
    }, delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, enabled, delay, run]);

  // Avertit avant de quitter la page avec une saisie non enregistrée.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(latest.current) !== last.current && enabled) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [enabled]);

  /** Enregistre tout de suite (avant l'envoi, la duplication…) ; `create` crée la commande même sans saisie. */
  const flush = useCallback(
    async (opts?: { create?: boolean }) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      return run(opts?.create ?? false);
    },
    [run],
  );

  /** Saisie locale non encore enregistrée (ou requête en cours / minuteur armé). */
  const isDirty = useCallback(
    () => JSON.stringify(latest.current) !== last.current || !!inflight.current || !!timer.current,
    [],
  );
  /** Version serveur connue (`updated`). */
  const version = useCallback(() => updated.current ?? null, []);

  /** Après une modification serveur (transition), reprend la nouvelle version comme référence. */
  const rebase = useCallback((nextUpdated: string, nextValue?: T) => {
    updated.current = nextUpdated;
    if (nextValue !== undefined) last.current = JSON.stringify(nextValue);
  }, []);

  return { state, savedAt, error, flush, rebase, isDirty, version, id: id.current, number };
}
