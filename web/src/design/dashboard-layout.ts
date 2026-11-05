import { z } from "zod";

// Disposition du tableau de bord, mémorisée par agent (users.preferences.dashboard).

export const WIDGET_IDS = [
  "service",
  "commandes",
  "impacts",
  "pmr-jour",
  "a-confirmer",
  "raccourcis",
  "trains",
  "main-courante",
  "perturbations",
  "travaux",
  "mentions",
  // « Prochaines prises en charge » (5 nov. 2026) : ex-colonne de droite de l'accueil, devenue un widget.
  "prochaines",
] as const;
// « equipe » (Présents aujourd'hui) retiré le 9 oct. 2026 : pas de source fiable sans planning.
export type WidgetId = (typeof WIDGET_IDS)[number];

/** Widgets sur deux colonnes par défaut (≥ 768 px). */
export const DEFAULT_WIDE: readonly WidgetId[] = ["commandes", "impacts", "a-confirmer"];

/**
 * Taille d'un widget (5 nov. 2026, redimensionnement à la souris) : `w` = colonnes sur une grille de 12 (≥ 1280 px ;
 * moitié arrondie sur la grille de 6 entre 768 et 1279 px), `h` = rangées de `--dash-row` (grille en `globals.css`).
 * Sous 768 px : une colonne, hauteur du contenu.
 */
export const SIZE_LIMITS = { minW: 3, maxW: 12, minH: 2, maxH: 16 } as const;
export const sizeSchema = z.object({
  w: z.number().int().min(SIZE_LIMITS.minW).max(SIZE_LIMITS.maxW),
  h: z.number().int().min(SIZE_LIMITS.minH).max(SIZE_LIMITS.maxH),
});
export type WidgetSize = z.infer<typeof sizeSchema>;

export const layoutSchema = z.object({
  order: z.array(z.enum(WIDGET_IDS)),
  hidden: z.array(z.enum(WIDGET_IDS)),
  // Taille choisie par l'agent (4 nov. 2026) : facultative, les dispositions enregistrées avant restent valides.
  wide: z.array(z.enum(WIDGET_IDS)).optional(),
  // Taille libre (5 nov. 2026) : remplace `wide` pour les widgets présents ici.
  sizes: z.partialRecord(z.enum(WIDGET_IDS), sizeSchema).optional(),
});
export type DashboardLayout = z.infer<typeof layoutSchema>;

/** Taille par défaut : trois rangées pleines sans trou sur 12 colonnes (4 + 4 + 4, 6 + 6, 3 × 4). */
export const DEFAULT_SIZES: Record<WidgetId, WidgetSize> = {
  service: { w: 12, h: 3 },
  commandes: { w: 8, h: 4 },
  "a-confirmer": { w: 8, h: 6 },
  "pmr-jour": { w: 4, h: 8 },
  prochaines: { w: 4, h: 8 },
  mentions: { w: 4, h: 8 },
  "main-courante": { w: 6, h: 7 },
  travaux: { w: 6, h: 7 },
  raccourcis: { w: 3, h: 5 },
  impacts: { w: 3, h: 5 },
  trains: { w: 3, h: 5 },
  perturbations: { w: 3, h: 5 },
};

export const DEFAULT_LAYOUT: DashboardLayout = {
  // « service » (bandeau en tête), « commandes » et « a-confirmer » (repris par l'accueil) ne sont pas dans la grille.
  order: [
    "service",
    "pmr-jour",
    "prochaines",
    "mentions",
    "main-courante",
    "travaux",
    "raccourcis",
    "impacts",
    "trains",
    "perturbations",
    "commandes",
    "a-confirmer",
  ],
  hidden: [],
  wide: [...DEFAULT_WIDE],
};

/** Lit une disposition enregistrée ; complète avec les widgets apparus depuis, ignore les inconnus (v1). */
export function normalizeLayout(value: unknown): DashboardLayout {
  // Widgets retirés depuis (ex. « equipe ») : ignorés au lieu de faire perdre toute la disposition.
  const known = (list: unknown) =>
    Array.isArray(list) ? list.filter((x) => (WIDGET_IDS as readonly unknown[]).includes(x)) : list;
  const v = value as { order?: unknown; hidden?: unknown; wide?: unknown; sizes?: unknown } | null;
  const parsed = layoutSchema.safeParse(
    v && typeof v === "object"
      ? {
          order: known(v.order),
          hidden: known(v.hidden),
          // Taille absente ou illisible : tailles par défaut, sans perdre l'ordre.
          wide: Array.isArray(v.wide) ? known(v.wide) : undefined,
          sizes: knownSizes(v.sizes),
        }
      : value,
  );
  if (!parsed.success) return DEFAULT_LAYOUT;
  const order = [...new Set(parsed.data.order)];
  // « Fin de service » (11 oct. 2026) apparaît en tête chez les agents qui ont déjà une disposition ; les autres
  // nouveaux widgets à la fin.
  // « Prochaines prises en charge » (5 nov. 2026) juste après : elle quitte la colonne de droite pour la grille.
  for (const id of WIDGET_IDS) {
    if (order.includes(id)) continue;
    if (id === "service") order.unshift(id);
    else if (id === "prochaines") order.splice(order[0] === "service" ? 1 : 0, 0, id);
    else order.push(id);
  }
  const out: DashboardLayout = {
    order,
    hidden: [...new Set(parsed.data.hidden)],
    wide: parsed.data.wide ? [...new Set(parsed.data.wide)] : [...DEFAULT_WIDE],
  };
  if (parsed.data.sizes && Object.keys(parsed.data.sizes).length) out.sizes = parsed.data.sizes;
  return out;
}

/** Tailles enregistrées lisibles seulement (widget connu, taille valide) ; les autres retombent sur le défaut. */
function knownSizes(value: unknown): Partial<Record<WidgetId, WidgetSize>> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Partial<Record<WidgetId, WidgetSize>> = {};
  for (const [k, v] of Object.entries(value)) {
    if (!(WIDGET_IDS as readonly string[]).includes(k)) continue;
    const size = sizeSchema.safeParse(v);
    if (size.success) out[k as WidgetId] = size.data;
  }
  return out;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Taille affichée : choix de l'agent, sinon la taille par défaut (prévue pour remplir la grille sans trou). L'ancien
 * réglage « Large / Normal » (`wide`, 4 nov. 2026) n'est plus lu : il donnait des tailles qui laissaient des trous.
 */
export function sizeOf(layout: DashboardLayout, id: WidgetId): WidgetSize {
  return layout.sizes?.[id] ?? DEFAULT_SIZES[id];
}

export function setSize(layout: DashboardLayout, id: WidgetId, size: WidgetSize): DashboardLayout {
  const next = {
    w: clamp(Math.round(size.w), SIZE_LIMITS.minW, SIZE_LIMITS.maxW),
    h: clamp(Math.round(size.h), SIZE_LIMITS.minH, SIZE_LIMITS.maxH),
  };
  const current = sizeOf(layout, id);
  if (current.w === next.w && current.h === next.h) return layout;
  return { ...layout, sizes: { ...layout.sizes, [id]: next } };
}

/** Colonnes occupées par un widget sur une grille de `cols` colonnes (12 dès 1280 px, 6 entre 768 et 1279 px). */
export function spanOf(size: WidgetSize, cols: 6 | 12): number {
  return cols === 12 ? size.w : clamp(Math.round(size.w / 2), 2, 6);
}

/**
 * Taille après un glisser de la poignée (`dx`, `dy` en px depuis le début) : arrondie à la case la plus proche de la
 * grille affichée (`cols` colonnes de `colPx`, rangées de `rowPx`, écarts compris).
 */
export function resizeBy(
  start: WidgetSize,
  dx: number,
  dy: number,
  grid: { cols: 6 | 12; colPx: number; rowPx: number },
): WidgetSize {
  const span = clamp(
    Math.round(spanOf(start, grid.cols) + dx / grid.colPx),
    grid.cols === 12 ? SIZE_LIMITS.minW : 2,
    grid.cols,
  );
  const w = grid.cols === 12 ? span : span * 2;
  // Sur la grille de 6, une largeur inchangée garde sa valeur fine (3, 5…) : pas de saut en passant la souris.
  return {
    w: clamp(span === spanOf(start, grid.cols) ? start.w : w, SIZE_LIMITS.minW, SIZE_LIMITS.maxW),
    h: clamp(Math.round(start.h + dy / grid.rowPx), SIZE_LIMITS.minH, SIZE_LIMITS.maxH),
  };
}

export function move(layout: DashboardLayout, id: WidgetId, delta: -1 | 1): DashboardLayout {
  const order = [...layout.order];
  const i = order.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return layout;
  [order[i], order[j]] = [order[j]!, order[i]!];
  return { ...layout, order };
}

/** Widget sur deux colonnes (≥ 768 px) : choix de l'agent, sinon la taille par défaut. */
export function isWide(layout: DashboardLayout, id: WidgetId): boolean {
  return (layout.wide ?? DEFAULT_WIDE).includes(id);
}

export function setWide(layout: DashboardLayout, id: WidgetId, wide: boolean): DashboardLayout {
  const current = layout.wide ?? [...DEFAULT_WIDE];
  if (current.includes(id) === wide) return layout;
  return { ...layout, wide: wide ? [...current, id] : current.filter((w) => w !== id) };
}

export function setHidden(layout: DashboardLayout, id: WidgetId, hidden: boolean): DashboardLayout {
  if (layout.hidden.includes(id) === hidden) return layout;
  return {
    ...layout,
    hidden: hidden ? [...layout.hidden, id] : layout.hidden.filter((h) => h !== id),
  };
}

/**
 * Place `id` à l'emplacement de `over` parmi les widgets `visible` (la liste à l'écran) ; les autres (masqués, repris
 * par l'accueil) gardent leur place dans l'ordre enregistré.
 */
export function reorder(
  layout: DashboardLayout,
  visible: readonly WidgetId[],
  id: WidgetId,
  over: WidgetId,
): DashboardLayout {
  const from = visible.indexOf(id);
  const to = visible.indexOf(over);
  if (from < 0 || to < 0 || from === to) return layout;
  const moved = [...visible];
  moved.splice(to, 0, ...moved.splice(from, 1));
  const queue = [...moved];
  const order = layout.order.map((w) => (visible.includes(w) ? queue.shift()! : w));
  return { ...layout, order };
}

/** Monte (-1) ou descend (+1) `id` d'un cran parmi les widgets `visible`. */
export function step(
  layout: DashboardLayout,
  visible: readonly WidgetId[],
  id: WidgetId,
  delta: -1 | 1,
): DashboardLayout {
  const over = visible[visible.indexOf(id) + delta];
  return over ? reorder(layout, visible, id, over) : layout;
}
