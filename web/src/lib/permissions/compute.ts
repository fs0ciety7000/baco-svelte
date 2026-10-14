// Calcul des permissions effectives d'un agent (lot L1, 14 oct. 2026). Miroir EXACT de
// `pocketbase/pb_hooks/lib/perms.js`, qui écrit `users.perms` (le test `catalog.test.ts` compare les deux).
//
// Héritage (inchangé depuis les rôles v2) : admin / sysop = tout ; écran, désactivé, connecteur = rien, même accordé ;
// sinon, pour chaque clé : accordée → oui ; retirée → non ; sinon le rôle décide (`roles` du catalogue). Une clé v3 hérite
// des `grants` / `denies` de ses clés `legacy`. Enfin, une clé dont une dépendance (`requires`) manque est retirée.
// Lot L3 : `rolePerms` = permissions du rôle lues dans la collection `roles` ; absent = rôles par défaut du catalogue.

import {
  CATALOG,
  CATALOG_KEYS,
  FULL_ROLES,
  NO_MODULE_ROLES,
  roleDefaults,
  type CatalogEntry,
} from "./catalog";

function list(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function computePerms(
  role: string,
  grants?: unknown,
  denies?: unknown,
  rolePerms?: readonly string[] | null,
): string[] {
  if (NO_MODULE_ROLES.includes(role)) return [];
  if (FULL_ROLES.includes(role)) return [...CATALOG_KEYS];
  const g = new Set(list(grants));
  const d = new Set(list(denies));
  const byRole = new Set(Array.isArray(rolePerms) ? list(rolePerms) : roleDefaults(role));
  const decide = (e: CatalogEntry): boolean => {
    if (g.has(e.key)) return true;
    if (d.has(e.key)) return false;
    for (const k of e.legacy) if (g.has(k)) return true;
    for (const k of e.legacy) if (d.has(k)) return false;
    return byRole.has(e.key);
  };
  const out = new Set(CATALOG.filter(decide).map((e) => e.key));
  // Dépendances : retirer jusqu'à stabilité (une clé retirée peut en entraîner d'autres).
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of CATALOG) {
      if (out.has(e.key) && e.requires.some((r) => !out.has(r))) {
        out.delete(e.key);
        changed = true;
      }
    }
  }
  return CATALOG_KEYS.filter((k) => out.has(k));
}
