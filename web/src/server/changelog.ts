import "server-only";

import { CHANGELOG_MD } from "@/generated/changelog-source";
import { parseChangelog, type Release } from "@/lib/changelog";

let cache: Release[] | null = null;

/** Versions de CHANGELOG.md (copie embarquée au build), de la plus récente à la plus ancienne. */
export function releases(): Release[] {
  cache ??= parseChangelog(CHANGELOG_MD);
  return cache;
}

/** Dernière version livrée (« 2026.10.14 »), affichée en pied de la barre latérale. */
export function currentVersion(): string | null {
  return releases()[0]?.version ?? null;
}
