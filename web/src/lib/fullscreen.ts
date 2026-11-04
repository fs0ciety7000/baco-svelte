"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Plein écran d'un bloc de la page (Carte PN, zones SPI ; 4 nov. 2026). Le bloc passe en `fixed inset-0` (repli CSS, seul
// mode sur iPhone) et, si le navigateur le permet, la PAGE entière passe en plein écran natif (`documentElement`) : les
// panneaux, listes et toasts rendus en portail dans `body` restent visibles par-dessus le bloc, ce qui ne serait pas le cas
// avec le plein écran natif du bloc lui-même.

type FsDoc = {
  fullscreenEnabled?: boolean;
  fullscreenElement?: Element | null;
  documentElement: { requestFullscreen?: unknown };
};

/** Le plein écran natif est utilisable (absent sur iPhone, refusé dans une iframe sans `allowfullscreen`). */
export function nativeFullscreenAvailable(doc: FsDoc | undefined): boolean {
  return !!doc?.fullscreenEnabled && typeof doc.documentElement.requestFullscreen === "function";
}

/**
 * Échap ferme le plein écran (mode CSS) seulement si rien d'autre ne l'a pris : un dialogue, une liste ouverte ou le
 * panneau d'une fiche se ferment d'abord.
 */
export function escapeExitsFullscreen(
  e: { key: string; defaultPrevented: boolean },
  overlayOpen: boolean,
): boolean {
  return e.key === "Escape" && !e.defaultPrevented && !overlayOpen;
}

const OVERLAY =
  '[role="dialog"], [role="alertdialog"], [data-radix-popper-content-wrapper], [data-vaul-drawer]';

export function useBlockFullscreen(onChange?: (full: boolean) => void) {
  const [full, setFull] = useState(false);
  const native = useRef(false);
  const cb = useRef(onChange);
  cb.current = onChange;

  const exit = useCallback(() => {
    setFull(false);
    if (native.current && document.fullscreenElement)
      void document.exitFullscreen?.().catch(() => {});
    native.current = false;
  }, []);

  const enter = useCallback(() => {
    setFull(true);
    if (nativeFullscreenAvailable(document) && !document.fullscreenElement) {
      document.documentElement
        .requestFullscreen({ navigationUI: "hide" })
        .then(() => (native.current = true))
        .catch(() => (native.current = false));
    }
  }, []);

  const toggle = useCallback(() => (full ? exit() : enter()), [full, enter, exit]);

  useEffect(() => {
    cb.current?.(full);
    if (!full) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    root.dataset.blockFullscreen = "";
    // Le navigateur quitte son plein écran (Échap, geste) : le bloc reprend sa place.
    const onFs = () => {
      if (!document.fullscreenElement && native.current) {
        native.current = false;
        setFull(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (escapeExitsFullscreen(e, !!document.querySelector(OVERLAY))) exit();
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = prev;
      delete root.dataset.blockFullscreen;
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("keydown", onKey);
    };
  }, [full, exit]);

  // Quitter la page en plein écran : on rend la main au navigateur.
  useEffect(
    () => () => {
      if (native.current && document.fullscreenElement)
        void document.exitFullscreen?.().catch(() => {});
    },
    [],
  );

  return { full, toggle, exit };
}
