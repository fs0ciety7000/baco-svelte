import { MODULE_IDS, type ModuleId } from "./tokens";

/** Couleur d'un module (`--mod-<id>`) : propre au module dans les thèmes « taxonomie » (Craie), l'accent ailleurs. */
export function modColor(id: string): string {
  return (MODULE_IDS as readonly string[]).includes(id)
    ? `var(--mod-${id as ModuleId})`
    : "var(--accent)";
}
