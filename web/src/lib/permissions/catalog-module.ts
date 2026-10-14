// Texte de la copie du catalogue pour les hooks PocketBase (`pocketbase/pb_hooks/lib/catalog.js`), écrit par
// `npm run catalog` et comparé par `catalog.test.ts`. Lu par Node sans compilation : importation relative avec extension.
import { CATALOG, FULL_ROLES, NO_MODULE_ROLES } from "./catalog.ts";

export function catalogModule(): string {
  const entries = CATALOG.map((e) => ({
    key: e.key,
    requires: e.requires,
    legacy: e.legacy,
    roles: e.roles,
    level: e.level,
    v2: e.v2,
  }));
  return (
    "// Généré par `npm run catalog` (web/) depuis web/src/lib/permissions/catalog.ts : ne pas modifier à la main.\n" +
    "// Lu par lib/perms.js (calcul de users.perms).\n" +
    `const CATALOG = [\n${entries.map((e) => `\t${JSON.stringify(e)}`).join(",\n")}\n];\n` +
    `const FULL_ROLES = ${JSON.stringify(FULL_ROLES)};\n` +
    `const NO_MODULE_ROLES = ${JSON.stringify(NO_MODULE_ROLES)};\n` +
    "module.exports = { CATALOG, FULL_ROLES, NO_MODULE_ROLES };\n"
  );
}
