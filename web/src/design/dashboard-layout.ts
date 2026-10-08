import { z } from "zod";

// Disposition du tableau de bord, mémorisée par agent (users.preferences.dashboard).

export const WIDGET_IDS = [
  "commandes",
  "a-confirmer",
  "raccourcis",
  "trains",
  "main-courante",
  "equipe",
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export const layoutSchema = z.object({
  order: z.array(z.enum(WIDGET_IDS)),
  hidden: z.array(z.enum(WIDGET_IDS)),
});
export type DashboardLayout = z.infer<typeof layoutSchema>;

export const DEFAULT_LAYOUT: DashboardLayout = { order: [...WIDGET_IDS], hidden: [] };

/** Lit une disposition enregistrée ; complète avec les widgets apparus depuis, ignore les inconnus (v1). */
export function normalizeLayout(value: unknown): DashboardLayout {
  const parsed = layoutSchema.safeParse(value);
  if (!parsed.success) return DEFAULT_LAYOUT;
  const order = [...new Set(parsed.data.order)];
  for (const id of WIDGET_IDS) if (!order.includes(id)) order.push(id);
  return { order, hidden: [...new Set(parsed.data.hidden)] };
}

export function move(layout: DashboardLayout, id: WidgetId, delta: -1 | 1): DashboardLayout {
  const order = [...layout.order];
  const i = order.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return layout;
  [order[i], order[j]] = [order[j]!, order[i]!];
  return { ...layout, order };
}
