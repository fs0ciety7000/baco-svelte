// Référentiel des gares par défaut (14 oct. 2026) : districts, types et lignes validés par l'équipe dans Ressources ›
// Gares de la préversion, repris dans le dépôt (`src/data/station-seed.json`, généré par `scripts/station-seed.mjs` depuis
// l'export JSON `/api/referentiels/gares/export?format=json`). L'import l'applique comme valeur « automatique » : une
// instance neuve (production) part de ces districts, une correction faite ensuite dans CSM (district manuel) reste.
// Données d'exploitation seulement.

import seed from "@/data/station-seed.json";

/** d = district (« » = aucun), k = type, l = lignes saisies à la main. */
export type StationSeedEntry = { d?: string; k?: string; l?: string[] };

const SEED = seed as Record<string, StationSeedEntry>;

/** Entrée du référentiel par défaut pour une clé de gare (`foldStation(nom)`), ou `undefined`. */
export function stationSeed(key: string): StationSeedEntry | undefined {
  return Object.prototype.hasOwnProperty.call(SEED, key) ? SEED[key] : undefined;
}
