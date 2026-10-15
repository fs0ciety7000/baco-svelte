// Styles partagés du shell (lot 3 du design v4, 15 oct. 2026).

/**
 * Bouton-icône « nu » de la barre du haut (présence, cloche, recherche mobile, menu du compte) : 34 px à la souris dès
 * 768 px, 44 px au tactile et en mobile ; icône 18 px ; survol en `surface-3` (variante `ghost`).
 */
export const SHELL_ICON =
  "size-11 md:pointer-fine:size-[2.125rem] text-fg-muted hover:text-fg [&_svg]:size-[1.125rem]";

/** Menus déroulants du shell : carte flottante (ombre du thème ; contour pour les thèmes sans ombre). */
export const SHELL_MENU =
  "z-50 rounded-box border border-border bg-surface shadow-float data-[state=open]:animate-fade-in";
