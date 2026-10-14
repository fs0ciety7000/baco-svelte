// Ombres de bord d'un tableau qui défile horizontalement (15 oct. 2026 : tableau des Missions PMR coupé à droite sans
// indice visuel). Pure et testée : vrai à gauche dès qu'on a défilé, vrai à droite tant qu'il reste du contenu caché.
// Tolérance d'un pixel (zoom, arrondis des largeurs fractionnaires).

export function scrollEdges(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
): { left: boolean; right: boolean } {
  const max = Math.max(0, scrollWidth - clientWidth);
  if (max <= 1) return { left: false, right: false };
  const x = Math.min(Math.max(0, Math.abs(scrollLeft)), max);
  return { left: x > 1, right: x < max - 1 };
}
