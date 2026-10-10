import { z } from "zod";

import { LOG_CATEGORIES, type LogCategory } from "./log";

// Tri automatique des messages du Journal (demande du 10 oct. 2026), miroir de `journalCategory` du hook PocketBase
// (`pocketbase/pb_hooks/lib/operations.js`) : règles source + mots-clés → catégorie, dans l'ordre.

export const RULE_SOURCES = {
  irail: "Perturbations / travaux iRail",
  baco: "Messages repris de BACO",
} as const;
export type RuleSource = keyof typeof RULE_SOURCES;

export const ruleSchema = z.object({
  source: z.enum(["irail", "baco"]),
  match: z.string().trim().max(300).default(""),
  category: z.enum(LOG_CATEGORIES),
});
export const rulesSchema = z.object({ rules: z.array(ruleSchema).max(40) });
export type JournalRule = z.infer<typeof ruleSchema>;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Catégorie d'un message : 1re règle de la source dont un mot-clé (séparés par des virgules) figure dans le texte ;
 * sinon `fixed` (imposée par le type, ex. travaux iRail) ; sinon la règle sans mot-clé de la source ; sinon `fallback`.
 */
export function ruleCategory(
  rules: JournalRule[],
  source: RuleSource,
  text: string,
  fallback: LogCategory,
  fixed?: LogCategory,
): LogCategory {
  const list = rules.filter((r) => r.source === source);
  const t = fold(text);
  for (const r of list) {
    const words = r.match
      .split(",")
      .map((w) => fold(w).trim())
      .filter(Boolean);
    if (words.length && words.some((w) => t.includes(w))) return r.category;
  }
  if (fixed) return fixed;
  return list.find((r) => !r.match.trim())?.category ?? fallback;
}
