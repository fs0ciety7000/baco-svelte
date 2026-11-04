// Visite guidée : lecture du DOM (cible visible, boîte, défilement). Côté navigateur seulement.

import type { Box } from "@/lib/tour/position";

/** Élément réellement affiché (ni `display: none`, ni masqué, ni de taille nulle). */
export function isShown(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  if (typeof (el as HTMLElement).checkVisibility === "function")
    return (el as HTMLElement).checkVisibility({
      visibilityProperty: true,
      opacityProperty: false,
    });
  return getComputedStyle(el).visibility !== "hidden";
}

/** Première cible visible parmi les sélecteurs, dans l'ordre (le shell a souvent une version desktop et une mobile). */
export function findTarget(selectors: readonly string[]): HTMLElement | null {
  for (const sel of selectors) {
    let list: NodeListOf<HTMLElement>;
    try {
      list = document.querySelectorAll<HTMLElement>(sel);
    } catch {
      continue;
    }
    for (const el of list) if (!el.closest("[data-tour-root]") && isShown(el)) return el;
  }
  return null;
}

export function boxOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function viewport(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Amène la cible dans la fenêtre si elle n'y est pas entièrement (une barre collée ne bouge pas). */
export function bringIntoView(el: HTMLElement) {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const pos = getComputedStyle(n).position;
    if (pos === "fixed" || pos === "sticky") return;
  }
  const b = boxOf(el);
  const vp = viewport();
  if (b.top >= 56 && b.top + b.height <= vp.height - 8) return;
  el.scrollIntoView({ block: b.height > vp.height * 0.6 ? "start" : "center", behavior: "auto" });
}
