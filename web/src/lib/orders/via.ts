// Gares « via » d'un bon taxi (demande du 14 oct. 2026 : plusieurs gares dans l'ordre du trajet). Stockage :
// `taxi_orders.via_stations` (JSON, liste ordonnée) ; `via_station` (texte) garde la même liste jointe par « · » pour la
// recherche et les anciens bons (BACO, CSM avant le 14 oct.), qui n'ont que ce texte : il est alors lu comme une seule
// étape, tel quel (« Frameries ghlin » reste une étape, on ne devine pas un découpage).

export const VIA_MAX = 10;
export const VIA_SEPARATOR = " · ";

/** Liste des gares via d'une fiche : `via_stations` d'abord, sinon l'ancien texte `via_station` comme une seule étape. */
export function viaList(rec: { [key: string]: unknown }): string[] {
  const raw = rec.via_stations;
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = raw ? JSON.parse(raw) : [];
    } catch {
      list = [];
    }
  }
  const clean = cleanVias(Array.isArray(list) ? list : []);
  if (clean.length) return clean;
  const legacy = typeof rec.via_station === "string" ? rec.via_station.trim() : "";
  return legacy ? [legacy] : [];
}

/** Étapes remplies, dans l'ordre (les lignes vides du formulaire sont retirées), 10 au plus. */
export function cleanVias(list: readonly unknown[]): string[] {
  return list
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, VIA_MAX);
}

/** Texte des étapes (« Frameries · Ghlin »), copie stockée dans `via_station`. */
export function viaText(list: readonly string[]): string {
  return cleanVias(list).join(VIA_SEPARATOR);
}

/** Trajet complet : « Mons → Frameries → Ghlin → Tournai ». */
export function routeWithVias(from: string, vias: readonly string[], to: string): string {
  return [from || "?", ...cleanVias(vias), to || "?"].join(" → ");
}

/** Déplace l'étape `i` d'un cran (`-1` monter, `+1` descendre) ; liste inchangée hors bornes. */
export function moveVia<T>(list: readonly T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return [...list];
  const next = [...list];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}
