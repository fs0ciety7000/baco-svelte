// Tuiles de la carte PN : seules les tuiles de la Belgique aux zooms utiles sont relayées (pas de relais ouvert).
const BBOX = { west: 2.4, east: 6.5, south: 49.4, north: 51.6 };
export const MIN_ZOOM = 7;
export const MAX_ZOOM = 18;

const lon2x = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

export function inBelgium(z: number, x: number, y: number): boolean {
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (z < MIN_ZOOM || z > MAX_ZOOM) return false;
  return (
    x >= lon2x(BBOX.west, z) - 1 &&
    x <= lon2x(BBOX.east, z) + 1 &&
    y >= lat2y(BBOX.north, z) - 1 &&
    y <= lat2y(BBOX.south, z) + 1
  );
}
