// Visite guidée : géométrie de la découpe (spotlight) et placement de la carte près de la cible, jamais hors de
// l'écran. Logique pure, testée dans `position.test.ts`.

export type Box = { top: number; left: number; width: number; height: number };
export type Size = { width: number; height: number };
export type Side = "bottom" | "top" | "right" | "left" | "over" | "center";

/** Découpe autour de la cible : marge `pad`, bornée à la fenêtre (une cible plus haute que l'écran reste visible). */
export function spotlightBox(target: Box, viewport: Size, pad = 6): Box {
  const top = Math.max(0, target.top - pad);
  const left = Math.max(0, target.left - pad);
  const bottom = Math.min(viewport.height, target.top + target.height + pad);
  const right = Math.min(viewport.width, target.left + target.width + pad);
  return {
    top,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), Math.max(min, max));

/**
 * Position de la carte : sous la cible, sinon au-dessus, à droite, à gauche ; si aucun côté n'a la place (cible très
 * grande), la carte se pose en bas de la fenêtre par-dessus la cible (`over`). Sans cible : centrée. Toujours dans la
 * fenêtre, à `margin` des bords.
 */
export function placeCard(
  target: Box | null,
  card: Size,
  viewport: Size,
  { gap = 12, margin = 12 }: { gap?: number; margin?: number } = {},
): { top: number; left: number; side: Side } {
  const maxLeft = viewport.width - card.width - margin;
  const maxTop = viewport.height - card.height - margin;
  if (!target) {
    return {
      top: clamp((viewport.height - card.height) / 2, margin, maxTop),
      left: clamp((viewport.width - card.width) / 2, margin, maxLeft),
      side: "center",
    };
  }
  const centerX = clamp(target.left + target.width / 2 - card.width / 2, margin, maxLeft);
  const centerY = clamp(target.top + target.height / 2 - card.height / 2, margin, maxTop);
  const below = target.top + target.height + gap;
  if (below + card.height <= viewport.height - margin)
    return { top: below, left: centerX, side: "bottom" };
  const above = target.top - gap - card.height;
  if (above >= margin) return { top: above, left: centerX, side: "top" };
  const right = target.left + target.width + gap;
  if (right + card.width <= viewport.width - margin)
    return { top: centerY, left: right, side: "right" };
  const left = target.left - gap - card.width;
  if (left >= margin) return { top: centerY, left, side: "left" };
  return { top: clamp(maxTop, margin, maxTop), left: centerX, side: "over" };
}

/**
 * Mobile (< 768 px) : la carte est une feuille pleine largeur, en bas par défaut ; en haut quand la cible serait dessous
 * (barre d'onglets du bas, bouton « Plus »).
 */
export function sheetSide(
  target: Box | null,
  sheetHeight: number,
  viewport: Size,
  gap = 12,
): "bottom" | "top" {
  if (!target) return "bottom";
  return target.top + target.height <= viewport.height - sheetHeight - gap ? "bottom" : "top";
}

/** Translation d'un FLIP (ancienne → nouvelle boîte), pour animer en `transform` seulement. */
export function flipFrom(from: Box, to: Box): { x: number; y: number; sx: number; sy: number } {
  return {
    x: from.left - to.left,
    y: from.top - to.top,
    sx: to.width > 0 ? from.width / to.width : 1,
    sy: to.height > 0 ? from.height / to.height : 1,
  };
}
