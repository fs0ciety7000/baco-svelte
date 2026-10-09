"use client";

import { useEffect, useRef } from "react";

import { highlightElements } from "@/lib/motion";

/**
 * Signale les lignes arrivées ou modifiées en direct (audit motion du 9 oct. 2026 : le direct changeait sans le dire).
 * `sigs` = clé de ligne → signature (statut, heure, `updated`…). Rien au premier rendu ni au retour sur la page :
 * seules les différences entre deux rendus successifs sont signalées. Les lignes portent `data-hl="<clé>"` dans un
 * conteneur `data-hl-scope="<scope>"` (un <tbody> ne peut pas être enveloppé : d'où ce composant sans rendu).
 */
export function LiveHighlight({
  scope,
  sigs,
  context = "",
}: {
  scope: string;
  sigs: Record<string, string>;
  /** Filtres affichés : s'ils changent (navigation côté client), nouvelle base sans signal. */
  context?: string;
}) {
  const prev = useRef<{ sigs: Record<string, string>; context: string } | null>(null);
  const key = JSON.stringify(sigs);
  useEffect(() => {
    const was = prev.current;
    prev.current = { sigs, context };
    if (!was || was.context !== context) return;
    const before = was.sigs;
    const changed = Object.keys(sigs).filter((k) => before[k] !== sigs[k]);
    if (!changed.length) return;
    const els: HTMLElement[] = [];
    for (const root of document.querySelectorAll(`[data-hl-scope="${CSS.escape(scope)}"]`))
      for (const k of changed)
        root
          .querySelectorAll<HTMLElement>(`[data-hl="${CSS.escape(k)}"]`)
          .forEach((el) => els.push(el));
    highlightElements(els);
    // `key` résume `sigs` (objet recréé à chaque rendu).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, scope, context]);
  return null;
}
