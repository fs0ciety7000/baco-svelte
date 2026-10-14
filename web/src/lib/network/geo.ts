// Géométrie du réseau (pure, testée) : distances, projection locale plane en kilomètres (Belgique : l'erreur d'une
// projection équirectangulaire centrée sur 50,5° N reste sous 1 % sur 300 km, largement assez pour des zones et des PN).

export type LatLon = { lat: number; lon: number };
export type Pt = [number, number];

const R = 6371.0088;
const LAT0 = 50.5;
const LON0 = 4.5;
const KX = (Math.PI / 180) * R * Math.cos((LAT0 * Math.PI) / 180);
const KY = (Math.PI / 180) * R;

export function haversineKm(a: LatLon, b: LatLon): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Coordonnées → plan local (km, x vers l'est, y vers le nord). */
export function toLocal(p: LatLon): Pt {
  return [(p.lon - LON0) * KX, (p.lat - LAT0) * KY];
}

export function fromLocal([x, y]: Pt): LatLon {
  return { lat: LAT0 + y / KY, lon: LON0 + x / KX };
}

/** Position valide en Belgique et alentours (les coordonnées 0 = « inconnues »). */
export function hasPosition(p: { lat?: number; lon?: number }): p is LatLon {
  return (
    typeof p.lat === "number" &&
    typeof p.lon === "number" &&
    p.lat > 49 &&
    p.lat < 52 &&
    p.lon > 2 &&
    p.lon < 7
  );
}

/** Projection d'un point sur un segment [a, b] : fraction t (0 à 1) et distance (km, plan local). */
export function projectOnSegment(p: Pt, a: Pt, b: Pt): { t: number; dist: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return { t, dist: Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)) };
}
