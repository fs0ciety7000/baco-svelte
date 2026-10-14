// Copie le catalogue des permissions (src/lib/permissions/catalog.ts) dans pocketbase/pb_hooks/lib/catalog.js, lu par
// les hooks (calcul de `users.perms`). `npm run catalog` après chaque modification du catalogue ; lancé aussi avant
// `npm run build` ; src/lib/permissions/catalog.test.ts échoue si la copie n'est pas à jour.
// Image Docker de csm-web (contexte web/ seul) : le dossier pocketbase/ est absent, rien n'est écrit.
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

import { catalogModule } from "../src/lib/permissions/catalog-module.ts";

const dir = path.join(import.meta.dirname, "../../pocketbase/pb_hooks/lib");
if (!existsSync(dir)) {
  console.log("pocketbase/pb_hooks/lib absent : copie du catalogue non écrite");
  process.exit(0);
}
const out = path.join(dir, "catalog.js");
writeFileSync(out, catalogModule());
console.log(`Écrit : ${path.relative(process.cwd(), out)}`);
