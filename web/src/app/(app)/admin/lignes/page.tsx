import { permanentRedirect } from "next/navigation";

// Admin › Lignes et arrêts (table BACO line_stations) remplacé le 14 oct. 2026 par l'édition des lignes du référentiel
// dans Ressources › Lignes (administrateurs, coordinateurs PACO/RCCA, modérateurs).
export default function Page() {
  permanentRedirect("/referentiels/lignes");
}
