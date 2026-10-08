// Régénère src/app/themes.css depuis src/design/tokens.ts (npm run tokens).
import { writeFileSync } from "node:fs";
import path from "node:path";

import { themesCss } from "../src/design/tokens.ts";

const out = path.join(import.meta.dirname, "../src/app/themes.css");
writeFileSync(out, themesCss());
console.log(`Écrit : ${path.relative(process.cwd(), out)}`);
