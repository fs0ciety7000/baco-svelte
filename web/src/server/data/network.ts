import "server-only";

import { zoneShapes, type ZoneShapes } from "@/lib/network/voronoi";
import { env } from "@/server/env";

import { pbForRequest } from "./orders";

// Zones SPI (1760004800) : fiches des zones (lecture avec le jeton de l'agent) et dessin des zones (cellules de Voronoï
// des gares rattachées, calculé par le serveur depuis l'état interne, gardé 5 min en mémoire : rien de nominatif).

const str = (v: unknown) => (typeof v === "string" ? v : "");

export type SpiZone = {
  id: string;
  code: string;
  name: string;
  district: string;
  color: string;
  refStation: string;
  notes: string;
  /** Polygone GeoJSON posé à la main (sinon dessin calculé). */
  polygon: unknown;
  updated: string;
};

export async function listSpiZones(): Promise<SpiZone[]> {
  const pb = await pbForRequest();
  const items = await pb
    .collection("spi_zones")
    .getFullList({ sort: "code", batch: 100 })
    .catch(() => []);
  return items.map((r) => ({
    id: r.id,
    code: str(r.code),
    name: str(r.name),
    district: str(r.district),
    color: /^#[0-9a-f]{6}$/.test(str(r.color)) ? str(r.color) : "#888888",
    refStation: str(r.ref_station),
    notes: str(r.notes),
    polygon: r.polygon ?? null,
    updated: str(r.updated),
  }));
}

type StatePoint = { key: string; lat: number; lon: number; zone: string; kind: string };

const g = globalThis as { __csmSpiShapes?: { at: number; sig: string; shapes: ZoneShapes } };
const TTL = 5 * 60_000;

/** Dessin des zones (cellules par zone, frontières, étiquettes). Vide si le secret interne manque. */
export async function spiShapes(): Promise<ZoneShapes> {
  const empty: ZoneShapes = { cells: {}, borders: [], labels: {}, outlines: {} };
  if (env.CSM_INTERNAL_SECRET.length < 32) return empty;
  const cached = g.__csmSpiShapes;
  if (cached && Date.now() - cached.at < TTL) return cached.shapes;
  const res = await fetch(`${env.PB_URL.replace(/\/$/, "")}/api/csm/network/state`, {
    headers: { "x-csm-internal": env.CSM_INTERNAL_SECRET },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return cached?.shapes ?? empty;
  const body = (await res.json()) as { stations?: StatePoint[] };
  const pts = (body.stations ?? []).filter((s) => s.zone && s.kind !== "etranger");
  const sig = pts.map((p) => `${p.key}:${p.zone}`).join("|");
  if (cached && cached.sig === sig) {
    g.__csmSpiShapes = { ...cached, at: Date.now() };
    return cached.shapes;
  }
  const shapes = zoneShapes(pts);
  g.__csmSpiShapes = { at: Date.now(), sig, shapes };
  return shapes;
}

/** Après une modification des rattachements : le prochain dessin est recalculé. */
export function invalidateSpiShapes() {
  g.__csmSpiShapes = undefined;
}

// ---------------------------------------------------------------------------------------------------
// Administration › Référentiels › Zones SPI : gares et leur zone

export type ZoneStationRow = {
  id: string;
  key: string;
  name: string;
  kind: string;
  lat: number;
  lon: number;
  district: string;
  lines: string[];
  zone: string;
  source: string;
  updated: string;
};

export async function listZoneStations(): Promise<ZoneStationRow[]> {
  const pb = await pbForRequest();
  const items = await pb.collection("stations").getFullList({
    fields: "id,key,name,kind,lat,lon,district,lines,spi_zone,spi_zone_source,updated",
    sort: "name",
    batch: 1000,
  });
  return items.map((r) => ({
    id: r.id,
    key: str(r.key),
    name: str(r.name),
    kind: str(r.kind),
    lat: typeof r.lat === "number" ? r.lat : 0,
    lon: typeof r.lon === "number" ? r.lon : 0,
    district: str(r.district),
    lines: Array.isArray(r.lines) ? (r.lines as unknown[]).map(String) : [],
    zone: str(r.spi_zone),
    source: str(r.spi_zone_source),
    updated: str(r.updated),
  }));
}
