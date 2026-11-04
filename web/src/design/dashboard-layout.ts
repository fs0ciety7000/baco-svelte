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
] as const;
// « equipe » (Présents aujourd'hui) retiré le 9 oct. 2026 : pas de source fiable sans planning.
export type WidgetId = (typeof WIDGET_IDS)[number];

/** Widgets sur deux colonnes par défaut (≥ 768 px). */
export const DEFAULT_WIDE: readonly WidgetId[] = ["commandes", "impacts", "a-confirmer"];

export const layoutSchema = z.object({
  order: z.array(z.enum(WIDGET_IDS)),
  hidden: z.array(z.enum(WIDGET_IDS)),
  // Taille choisie par l'agent (4 nov. 2026) : facultative, les dispositions enregistrées avant restent valides.
  wide: z.array(z.enum(WIDGET_IDS)).optional(),
});
export type DashboardLayout = z.infer<typeof layoutSchema>;

export const DEFAULT_LAYOUT: DashboardLayout = {
  order: [...WIDGET_IDS],
  hidden: [],
  wide: [...DEFAULT_WIDE],
};

/** Lit une disposition enregistrée ; complète avec les widgets apparus depuis, ignore les inconnus (v1). */
export function normalizeLayout(value: unknown): DashboardLayout {
  // Widgets retirés depuis (ex. « equipe ») : ignorés au lieu de faire perdre toute la disposition.
  const known = (list: unknown) =>
    Array.isArray(list) ? list.filter((x) => (WIDGET_IDS as readonly unknown[]).includes(x)) : list;
  const v = value as { order?: unknown; hidden?: unknown; wide?: unknown } | null;
  const parsed = layoutSchema.safeParse(
    v && typeof v === "object"
      ? {
          order: known(v.order),
          hidden: known(v.hidden),
          // Taille absente ou illisible : tailles par défaut, sans perdre l'ordre.
          wide: Array.isArray(v.wide) ? known(v.wide) : undefined,
        }
      : value,
  );
  if (!parsed.success) return DEFAULT_LAYOUT;
  const order = [...new Set(parsed.data.order)];
  // « Fin de service » (11 oct. 2026) apparaît en tête chez les agents qui ont déjà une disposition ; les autres
  // nouveaux widgets à la fin.
  for (const id of WIDGET_IDS) {
    if (order.includes(id)) continue;
    if (id === "service") order.unshift(id);
    else order.push(id);
  }
  return {
    order,
    hidden: [...new Set(parsed.data.hidden)],
    wide: parsed.data.wide ? [...new Set(parsed.data.wide)] : [...DEFAULT_WIDE],
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
