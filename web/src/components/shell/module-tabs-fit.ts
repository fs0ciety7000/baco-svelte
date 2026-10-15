// Répartition des onglets d'un module dans la barre du haut (pur, testé ; séparé du composant qui lit l'état du shell).

/** Largeur réservée au bouton « Plus » (libellé + chevron + marges). */
const MORE_WIDTH = 84;

/**
 * Tabs that fit in `width`: the active one is always kept; the rest go into « Plus » (14 Oct. 2026: the Administration
 * tabs were cut off in the top bar with no visible way to reach them).
 */
export function fitTabs(
  widths: number[],
  width: number,
  active: number,
): { shown: number[]; more: number[] } {
  const all = widths.map((_, i) => i);
  const total = widths.reduce((a, b) => a + b, 0);
  if (!widths.length || total <= width) return { shown: all, more: [] };
  const budget = width - MORE_WIDTH;
  const shown: number[] = [];
  let used = active >= 0 ? (widths[active] ?? 0) : 0;
  for (const i of all) {
    if (i === active) continue;
    const w = widths[i] ?? 0;
    if (used + w > budget) break;
    shown.push(i);
    used += w;
  }
  if (active >= 0) shown.push(active);
  shown.sort((a, b) => a - b);
  return { shown, more: all.filter((i) => !shown.includes(i)) };
}
