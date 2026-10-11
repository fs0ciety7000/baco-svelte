// Libellé d'une ligne ferroviaire (« L.132 »). Les valeurs reprises de BACO portent parfois déjà le préfixe (« L.132 »,
// « L 132 ») : on ne l'ajoute que s'il manque (affichage « L.L.132 » signalé le 11 oct. 2026).
export function lineLabel(line: string | number | null | undefined): string {
  const raw = String(line ?? "").trim();
  if (!raw) return "";
  return `L.${raw.replace(/^L\.?\s*/i, "")}`;
}
