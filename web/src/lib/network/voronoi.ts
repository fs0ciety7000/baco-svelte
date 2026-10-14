// Dessin des zones SPI (pur, testé : `voronoi.test.ts`) : chaque gare rattachée à une zone reçoit sa cellule de Voronoï
// (points plus proches d'elle que de toute autre gare), bornée à un disque de `radiusKm` autour d'elle — la zone n'est
// pas étendue à la mer ni loin du réseau. Une zone = l'ensemble des cellules de ses gares ; les frontières tracées sont
// les côtés partagés par deux cellules de zones différentes. Calcul par demi-plans (Sutherland-Hodgman) : une cellule
// part d'un polygone régulier et est coupée par la médiatrice de chaque voisine proche.

import { fromLocal, toLocal, type LatLon, type Pt } from "./geo";

export type ZonePoint = LatLon & { zone: string };

export type ZoneShapes = {
  /** Zone → cellules (anneaux [lat, lon], fermés implicitement). */
  cells: Record<string, [number, number][][]>;
  /** Frontières entre zones différentes : segments [[lat, lon], [lat, lon]]. */
  borders: { zones: [string, string]; path: [[number, number], [number, number]] }[];
  /** Zone → point d'étiquette (barycentre de ses gares). */
  labels: Record<string, [number, number]>;
};

const SIDES = 20;

/** Coupe un polygone convexe par le demi-plan { x : (x − m) · n ≤ 0 }. */
export function clipHalfPlane(poly: Pt[], m: Pt, n: Pt): Pt[] {
  const side = (p: Pt) => (p[0] - m[0]) * n[0] + (p[1] - m[1]) * n[1];
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
      const t = sa / (sa - sb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

/** Aire signée (km²) d'un polygone du plan local. */
export function polygonArea(poly: Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

const round = (v: number, d = 5) => Math.round(v * 10 ** d) / 10 ** d;
const ll = (p: Pt): [number, number] => {
  const g = fromLocal(p);
  return [round(g.lat), round(g.lon)];
};

/** Cellule de Voronoï bornée de chaque point (plan local), avec l'indice de la voisine de chaque côté (−1 = bord). */
export function boundedCells(
  pts: Pt[],
  radiusKm: number,
): { poly: Pt[]; neighbors: number[] }[] {
  // Grille d'accès : voisines à moins de 2 rayons seulement.
  const cell = radiusKm * 2;
  const grid = new Map<string, number[]>();
  const gk = (x: number, y: number) => `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
  pts.forEach((p, i) => {
    const k = gk(p[0], p[1]);
    const list = grid.get(k) ?? [];
    list.push(i);
    grid.set(k, list);
  });
  return pts.map((p, i) => {
    let poly: Pt[] = [];
    for (let s = 0; s < SIDES; s++) {
      const a = (2 * Math.PI * s) / SIDES;
      poly.push([p[0] + radiusKm * Math.cos(a), p[1] + radiusKm * Math.sin(a)]);
    }
    const gx = Math.floor(p[0] / cell);
    const gy = Math.floor(p[1] / cell);
    const near: number[] = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const j of grid.get(`${gx + dx}:${gy + dy}`) ?? []) if (j !== i) near.push(j);
    // Voisines les plus proches d'abord : la cellule rétrécit vite.
    near.sort((a, b) => dist2(pts[a]!, p) - dist2(pts[b]!, p));
    for (const j of near) {
      const q = pts[j]!;
      if (dist2(q, p) > 4 * radiusKm * radiusKm) break;
      poly = clipHalfPlane(poly, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], [q[0] - p[0], q[1] - p[1]]);
      if (poly.length < 3) break;
    }
    // Voisine de chaque côté : le milieu du côté est équidistant de p et d'elle.
    const neighbors = poly.map((a, k) => {
      const b = poly[(k + 1) % poly.length]!;
      const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const dp = Math.sqrt(dist2(mid, p));
      let best = -1;
      let gap = 1e-6 + dp * 1e-6;
      for (const j of near) {
        const g = Math.abs(Math.sqrt(dist2(mid, pts[j]!)) - dp);
        if (g < gap) {
          gap = g;
          best = j;
        }
      }
      return best;
    });
    return { poly, neighbors };
  });
}

const dist2 = (a: Pt, b: Pt) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/**
 * Formes des zones à partir des gares rattachées. Les points à moins de 50 m l'un de l'autre sont fusionnés (le premier
 * garde sa zone). `radiusKm` borne chaque cellule (6 km par défaut).
 */
export function zoneShapes(points: ZonePoint[], radiusKm = 6): ZoneShapes {
  const kept: { p: Pt; zone: string; geo: LatLon }[] = [];
  const seen = new Map<string, true>();
  for (const pt of points) {
    if (!pt.zone) continue;
    const p = toLocal(pt);
    const k = `${Math.round(p[0] * 20)}:${Math.round(p[1] * 20)}`;
    if (seen.has(k)) continue;
    seen.set(k, true);
    kept.push({ p, zone: pt.zone, geo: pt });
  }
  const cells = boundedCells(
    kept.map((k) => k.p),
    radiusKm,
  );
  const out: ZoneShapes = { cells: {}, borders: [], labels: {} };
  const sums = new Map<string, { lat: number; lon: number; n: number }>();
  cells.forEach(({ poly, neighbors }, i) => {
    const z = kept[i]!.zone;
    const s = sums.get(z) ?? { lat: 0, lon: 0, n: 0 };
    s.lat += kept[i]!.geo.lat;
    s.lon += kept[i]!.geo.lon;
    s.n++;
    sums.set(z, s);
    if (poly.length < 3) return;
    (out.cells[z] ??= []).push(poly.map(ll));
    poly.forEach((a, k) => {
      const j = neighbors[k]!;
      if (j < 0 || j < i) return; // chaque côté partagé une seule fois
      const other = kept[j]!.zone;
      if (other === z) return;
      out.borders.push({
        zones: [z, other],
        path: [ll(a), ll(poly[(k + 1) % poly.length]!)],
      });
    });
  });
  for (const [z, s] of sums) out.labels[z] = [round(s.lat / s.n), round(s.lon / s.n)];
  return out;
}

/** GeoJSON MultiPolygon d'une zone (export, polygone posé à la main). */
export function zoneGeoJson(rings: [number, number][][]) {
  return {
    type: "MultiPolygon" as const,
    coordinates: rings.map((r) => [[...r, r[0]!].map(([lat, lon]) => [lon, lat])]),
  };
}
