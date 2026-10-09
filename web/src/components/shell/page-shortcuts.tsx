"use client";

import { useEffect } from "react";

import { useShell } from "./shell-context";

export const SHORTCUTS_KEY = "csm-raccourcis";

/** Raccourcis à une touche désactivables (WCAG 2.1.4), réglage dans « Affichage ». */
export function shortcutsEnabled(): boolean {
  try {
    return window.localStorage.getItem(SHORTCUTS_KEY) !== "off";
  } catch {
    return true;
  }
}

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
    !!el.closest("[role=dialog]"));

/**
 * Raccourcis de page (audit UX du 9 oct. 2026) : « / » va au champ de recherche de la page (sinon ouvre la palette),
 * « N » déclenche l'action « nouveau » de la page (`data-shortcut="new"`). Jamais pendant une saisie ni dans un dialogue.
 */
export function PageShortcuts() {
  const { setPaletteOpen } = useShell();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing(e.target))
        return;
      if (!shortcutsEnabled()) return;
      if (e.key === "/") {
        const field = document.querySelector<HTMLInputElement>(
          'main [role="search"] input:not([type="hidden"]), main input[type="search"]',
        );
        e.preventDefault();
        if (field) {
          field.focus();
          field.select();
        } else setPaletteOpen(true);
      } else if (e.key === "n" || e.key === "N") {
        const target = document.querySelector<HTMLElement>('main [data-shortcut="new"]');
        if (target) {
          e.preventDefault();
          target.click();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);
  return null;
}
