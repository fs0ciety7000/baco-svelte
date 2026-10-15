// Styles partagés des puces (filtres, districts, bascules) : une seule apparence dans toute l'application (audit UI
// du 9 oct. 2026), en pilule depuis la refonte v4 (15 oct. 2026). La puce choisie lit les jetons du thème
// (`--chip-on-*` : contour accent + `accent-soft` par défaut, encre pleine dans la direction Cabine).

export const CHIP_BASE =
  "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-pill border px-3 text-small font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50";

export const CHIP_ON = "border-(--chip-on-border) bg-(--chip-on-bg) text-(--chip-on-fg)";

export const CHIP_OFF =
  "border-border bg-(--control-bg) text-fg-muted hover:border-border-strong hover:text-fg";
