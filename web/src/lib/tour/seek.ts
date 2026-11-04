// Visite guidée : décisions de la recherche d'une cible (attente, carte centrée, étape sautée) et de la navigation entre
// étapes. Logique pure, testée dans `seek.test.ts` (correctif du 4 nov. 2026 : en mobile, la visite restait bloquée
// pendant qu'elle cherchait une cible absente et « Suivant » ne faisait rien).

export const SEEK = {
  /** Plafond d'attente après un changement de page (page lente, compilation en développement). */
  navMax: 10_000,
  /** Une fois sur la bonne page : délai laissé au rendu (données, hydratation) avant de déclarer la cible absente. */
  settle: 2_500,
  /** Toujours pas sur la page : la navigation est relancée (une navigation plus ancienne a pu arriver après). */
  repush: 2_000,
  /** Nombre de navigations demandées au plus pour une étape. */
  maxPushes: 3,
  /** Intervalle entre deux recherches de la cible. */
  poll: 100,
} as const;

export type SeekInput = {
  /** Depuis le début de la recherche (ms). */
  elapsed: number;
  /** Depuis l'arrivée sur la bonne page (ms), null tant qu'on n'y est pas. */
  onPageFor: number | null;
  /** Une cible visible a été trouvée. */
  found: boolean;
  fallback?: "center" | "skip";
};

export type SeekDecision = "show" | "center" | "skip" | "wait";

/**
 * Cible trouvée : montrée. Sinon on attend que la page se pose (`settle` après l'arrivée), jamais plus que `navMax` ;
 * passé ce délai, carte centrée si l'étape le prévoit ET qu'on est sur sa page, sinon étape sautée.
 */
export function seekDecision({ elapsed, onPageFor, found, fallback }: SeekInput): SeekDecision {
  if (found) return "show";
  const settled = onPageFor !== null && onPageFor >= SEEK.settle;
  if (!settled && elapsed < SEEK.navMax) return "wait";
  return onPageFor !== null && fallback === "center" ? "center" : "skip";
}

/** Faut-il (re)demander la page de l'étape ? Jamais quand on y est ; une fois au départ, puis toutes les `repush` ms. */
export function shouldPush({
  onPage,
  elapsed,
  pushes,
}: {
  onPage: boolean;
  elapsed: number;
  pushes: number;
}): boolean {
  if (onPage || pushes >= SEEK.maxPushes) return false;
  return elapsed >= pushes * SEEK.repush;
}

/**
 * Étape suivante / précédente à partir de l'étape DEMANDÉE (et non de la dernière affichée : pendant une recherche, un
 * « Suivant » doit avancer). `"done"` après la dernière ; `null` avant la première.
 */
export function stepAfter(requested: number, delta: 1 | -1, total: number): number | "done" | null {
  const to = requested + delta;
  if (to < 0) return null;
  if (to >= total) return "done";
  return to;
}

/** Étape sautée : même sens ; avant la première on repart en avant ; après la dernière, la visite se termine. */
export function skipFrom(
  index: number,
  dir: 1 | -1,
  total: number,
): { index: number; dir: 1 | -1 } | "done" {
  const to = index + dir;
  if (to < 0) return index + 1 < total ? { index: index + 1, dir: 1 } : "done";
  if (to >= total) return "done";
  return { index: to, dir };
}
