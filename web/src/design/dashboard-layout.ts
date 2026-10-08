import { z } from "zod";

// Disposition du tableau de bord, mémorisée par agent (users.preferences.dashboard).

export const WIDGET_IDS = [
  "commandes",
  "a-confirmer",
  "raccourcis",
  "trains",
  "main-courante",
  "perturbations",
  "travaux",
] as const;
// « equipe » (Présents aujourd'hui) retiré le 9 oct. 2026 : pas de source fiable sans planning.
export type WidgetId = (typeof WIDGET_IDS)[number];

export const layoutSchema = z.object({
  order: z.array(z.enum(WIDGET_IDS)),
  hidden: z.array(z.enum(WIDGET_IDS)),
});
export type DashboardLayout = z.infer<typeof layoutSchema>;

export const DEFAULT_LAYOUT: DashboardLayout = { order: [...WIDGET_IDS], hidden: [] };

/** Lit une disposition enregistrée ; complète avec les widgets apparus depuis, ignore les inconnus (v1). */
export function normalizeLayout(value: unknown): DashboardLayout {
  // Widgets retirés depuis (ex. « equipe ») : ignorés au lieu de faire perdre toute la disposition.
  const known = (list: unknown) =>
    Array.isArray(list) ? list.filter((x) => (WIDGET_IDS as readonly unknown[]).includes(x)) : list;
  const v = value as { order?: unknown; hidden?: unknown } | null;
  const parsed = layoutSchema.safeParse(
    v && typeof v === "object" ? { order: known(v.order), hidden: known(v.hidden) } : value,
  );
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
