// Zones SPI relevées sur la carte « Répartition des PtCars en zones COI » (28/06/2023, document interne gardé hors du
// dépôt) : seul le résultat gare → zone est versionné (`src/data/spi-zone-seed.json`, clé = `stations.key`). Relevé du
// 15 oct. 2026 : position de chaque gare / PANG projetée sur la carte (Lambert 72, recalage sur 438 noms de gares), zone
// = couleur de la ligne tracée sous elle. Lu par le calcul des zones (serveur) seulement.

import seed from "@/data/spi-zone-seed.json";

export const SPI_SEED = seed as Record<string, string>;
