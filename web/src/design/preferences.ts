import { z } from "zod";

import { DENSITIES, THEME_IDS } from "./tokens";

// Préférences d'affichage de l'agent (cookie `csm_ui`, lu par le serveur pour poser data-theme sans flash).
export const UI_COOKIE = "csm_ui";

export const uiPreferencesSchema = z.object({
  theme: z.enum([...THEME_IDS, "auto"]).catch("auto"),
  density: z.enum(DENSITIES).catch("confortable"),
});

export type UiPreferences = z.infer<typeof uiPreferencesSchema>;

export const DEFAULT_UI: UiPreferences = { theme: "auto", density: "confortable" };

export function parseUiCookie(value: string | undefined): UiPreferences {
  if (!value) return DEFAULT_UI;
  try {
    return uiPreferencesSchema.parse(JSON.parse(value));
  } catch {
    return DEFAULT_UI;
  }
}
