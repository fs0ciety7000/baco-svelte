"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import { gsap, highlightElements, MOTION, NO_MOTION } from "@/lib/motion";

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
  swap = true,
}: {
  scope: string;
  sigs: Record<string, string>;
  /** Fondu de la liste au changement de filtres (désactivé pour un fil qui garde sa position). */
  swap?: boolean;
  /** Filtres affichés : s'ils changent (navigation côté client), nouvelle base sans signal. */
  context?: string;
}) {
  const prev = useRef<{ sigs: Record<string, string>; context: string } | null>(null);
  // Primitive `swap` : quand les filtres changent (navigation côté client), la liste réapparaît en fondu court au
  // lieu de changer d'un coup. Avant la peinture (useLayoutEffect) : pas d'image intermédiaire à pleine opacité.
  const lastContext = useRef<string | null>(null);
  useLayoutEffect(() => {
    const was = lastContext.current;
    lastContext.current = context;
    if (!swap || was === null || was === context || window.matchMedia(NO_MOTION).matches) return;
    const roots = document.querySelectorAll<HTMLElement>(`[data-hl-scope="${CSS.escape(scope)}"]`);
    if (roots.length)
      gsap.fromTo(
        roots,
        { autoAlpha: 0.35 },
        { autoAlpha: 1, duration: MOTION.micro, ease: "hud", clearProps: "opacity,visibility" },
      );
  }, [context, scope, swap]);
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
