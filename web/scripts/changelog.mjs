// Copie CHANGELOG.md (racine du dépôt) dans src/generated/changelog-source.ts : l'image Docker de csm-web est
// construite depuis web/ seul, la racine n'y est pas. `npm run changelog` après chaque modification du changelog ;
// lancé aussi avant `npm run build` ; src/lib/changelog.test.ts échoue si la copie n'est pas à jour.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../../CHANGELOG.md", import.meta.url));
const target = fileURLToPath(new URL("../src/generated/changelog-source.ts", import.meta.url));
if (!existsSync(source)) {
  // Build Docker (contexte web/ seul) : on garde la copie commitée.
  console.log("CHANGELOG.md absent : copie existante gardée");
  process.exit(0);
}
const markdown = readFileSync(source, "utf8");
writeFileSync(
  target,
  `// Généré par \`npm run changelog\` depuis ../CHANGELOG.md : ne pas modifier à la main.\n` +
    `export const CHANGELOG_MD =\n  ${JSON.stringify(markdown)};\n`,
);
console.log(`changelog-source.ts écrit (${markdown.length} caractères)`);
