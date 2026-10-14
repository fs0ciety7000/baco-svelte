import "server-only";

import { brusselsDay } from "@/lib/orders/time";
import { csvReader } from "@/lib/timetable/csv";
import {
  estimateBk,
  matchCrossings,
  parseInfrabelCrossing,
  type InfrabelCrossing,
} from "@/lib/network/crossings";
import {
  assignStationZones,
  crossingZone,
  lineKey,
  type ZoneLine,
  type ZoneStation,
} from "@/lib/network/spi";
import { SPI_SEED } from "@/lib/network/spi-seed";
import { env } from "@/server/env";

// Réseau (lot A, 15 oct. 2026) : passages à niveau des données ouvertes Infrabel et zones SPI des gares / PN.
//  1. État lu dans PocketBase (gares, lignes, PN, zones) par une route interne.
//  2. Zones des gares : carte des zones (relevé versionné), puis le long des lignes, puis gare la plus proche ; une zone
//     choisie à la main n'est jamais recalculée.
//  3. PN Infrabel (« geoow », CC0, ~1 400 PN, mis à jour chaque trimestre) : rapprochés des PN connus (n° Infrabel, ligne +
//     numéro, proximité), complétés sans rien écraser (adresse, zone saisie), nouveaux PN créés ; BK estimée le long de la
//     ligne ; PN Infrabel absents du fichier désactivés (jamais supprimés).
// Lancé à la fin de l'import quotidien des horaires (jamais bloquant) et par l'administration.

const INFRABEL_PN_URL =
  "https://opendata.infrabel.be/api/explore/v2.1/catalog/datasets/geoow/exports/csv?delimiter=%3B";
export const INFRABEL_PN_SOURCE =
  "https://opendata.infrabel.be/explore/dataset/geoow/ (licence CC0)";

type State = {
  stations: ZoneStation[];
  lines: (ZoneLine & { stations: { n: string; km?: number; b?: number; g?: number }[] })[];
  crossings: {
    id: string;
    line: string;
    number: string;
    lat: number;
    lon: number;
    bk: number;
    bkEstimated: boolean;
    zone: string;
    zoneSource: string;
    source: string;
    infrabelId: string;
    active: boolean;
  }[];
  zones: { code: string; district: string }[];
};

export type NetworkSummary = {
  at: string;
  stations: Record<string, number>;
  crossings?: {
    infrabel: number;
    matched: number;
    byNumber: number;
    byProximity: number;
    created: number;
    updated: number;
    conflicts: number;
    deactivated: number;
    bkEstimated: number;
  };
  error?: string;
};

async function internal<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${env.PB_URL.replace(/\/$/, "")}/api/csm/${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-csm-internal": env.CSM_INTERNAL_SECRET },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(json.message ?? `PocketBase : HTTP ${res.status} (${path}).`);
  return json;
}

/** Fichier Infrabel des PN (≈ 200 Ko). */
export async function readInfrabelCrossings(): Promise<InfrabelCrossing[]> {
  const res = await fetch(INFRABEL_PN_URL, {
    headers: { "user-agent": env.CSM_USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`opendata.infrabel.be : HTTP ${res.status}.`);
  const text = await res.text();
  if (text.length > 5_000_000) throw new Error("Fichier des PN démesuré.");
  const read = csvReader(";");
  const out: InfrabelCrossing[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const r = read(line);
    const pn = r ? parseInfrabelCrossing(r) : null;
    if (pn && !seen.has(pn.infrabelId)) {
      seen.add(pn.infrabelId);
      out.push(pn);
    }
  }
  return out;
}

async function inBatches<T>(items: T[], size: number, fn: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size));
}

const g = globalThis as { __csmNetworkRun?: Promise<NetworkSummary> | null };

/**
 * Un seul calcul à la fois par serveur. `crossings: false` = zones seulement (sans appel à Infrabel). Ne lève jamais :
 * l'erreur est rendue dans le résumé (`error`).
 */
export function networkRunning(): boolean {
  return !!g.__csmNetworkRun;
}

export function runNetworkImport(opts: { crossings?: boolean } = {}): Promise<NetworkSummary> {
  if (g.__csmNetworkRun) return g.__csmNetworkRun;
  const run = doRun(opts.crossings !== false)
    .catch((e): NetworkSummary => ({
      at: new Date().toISOString(),
      stations: {},
      error: (e instanceof Error ? e.message : String(e)).slice(0, 300),
    }))
    .then(async (summary) => {
      // Résumé gardé avec l'état de l'import (Administration › Référentiels › Imports) ; un recalcul des zones seules
      // garde le bilan du dernier import des PN.
      const prev = await internal<{ network?: NetworkSummary }>("timetable/status").catch(
        () => ({}),
      );
      const network =
        summary.crossings || summary.error
          ? summary
          : { ...summary, crossings: (prev as { network?: NetworkSummary }).network?.crossings };
      await internal("timetable/status", { patch: { network } }).catch(() => null);
      if (summary.error) console.error("[network]", summary.error);
      return summary;
    })
    .finally(() => {
      g.__csmNetworkRun = null;
    });
  g.__csmNetworkRun = run;
  return run;
}

async function doRun(withCrossings: boolean): Promise<NetworkSummary> {
  const at = new Date().toISOString();
  const state = await internal<State>("network/state");
  const codes = state.zones.map((z) => z.code);

  // Zones des gares.
  const assigned = assignStationZones(state.stations, state.lines, SPI_SEED, codes);
  const stationCounts: Record<string, number> = {};
  const changes: { key: string; zone: string; source: string }[] = [];
  for (const s of state.stations) {
    const a = assigned.get(s.key) ?? { zone: "", source: "" };
    stationCounts[a.source || "aucune"] = (stationCounts[a.source || "aucune"] ?? 0) + 1;
    if (s.source === "manuel") continue;
    if (a.zone !== s.zone || (a.zone ? a.source : "") !== s.source)
      changes.push({ key: s.key, zone: a.zone, source: a.source });
  }
  await inBatches(changes, 400, (items) => internal("network/zones", { items }));
  const zoned = state.stations.map((s) => ({
    lat: s.lat,
    lon: s.lon,
    lines: s.lines,
    zone: assigned.get(s.key)?.zone ?? "",
  }));

  const summary: NetworkSummary = { at, stations: stationCounts };
  if (!withCrossings) {
    // Zones seulement (après une correction dans l'administration) : zones des PN recalculées, sans appel à Infrabel.
    const items = state.crossings
      .filter((c) => c.zoneSource !== "baco" && c.zoneSource !== "manuel")
      .map((c) => ({ id: c.id, zone: crossingZone(c, zoned), before: c.zone }))
      .filter((c) => c.zone !== c.before)
      .map(({ id, zone }) => ({ id, zone }));
    await inBatches(items, 400, (batch) => internal("network/crossing-zones", { items: batch }));
    return summary;
  }

  // PN Infrabel.
  const infra = await readInfrabelCrossings();
  if (infra.length < 500)
    throw new Error(`Fichier Infrabel des PN incomplet (${infra.length} PN).`);
  const match = matchCrossings(state.crossings, infra);
  const pos = new Map(state.stations.map((s) => [s.name, s]));
  const lineStations = new Map(
    state.lines.map((l) => [
      l.line,
      l.stations
        .filter((s) => typeof s.b !== "number")
        .map((s) => {
          const p = pos.get(s.n);
          return { lat: p?.lat ?? 0, lon: p?.lon ?? 0, km: typeof s.km === "number" ? s.km : null };
        }),
    ]),
  );
  let bkEstimated = 0;
  const items = infra.map((pn) => {
    const bk = estimateBk(pn, lineStations.get(lineKey(pn.line)) ?? []);
    if (bk) bkEstimated++;
    return {
      id: match.byInfrabel.get(pn.infrabelId) ?? "",
      ...pn,
      bk: bk ?? 0,
      zone: crossingZone(pn, zoned),
    };
  });
  const day = brusselsDay();
  const totals = { created: 0, updated: 0, conflicts: 0 };
  await inBatches(items, 300, async (batch) => {
    const r = await internal<{ created: number; updated: number; conflicts: number }>(
      "network/crossings",
      { items: batch, day },
    );
    totals.created += r.created;
    totals.updated += r.updated;
    totals.conflicts += r.conflicts;
  });
  const fin = await internal<{ deactivated: number }>("network/crossings/finish", {
    day,
    seen: infra.length,
  });
  // PN connus sans pendant Infrabel (repris de BACO sans zone, saisis dans CSM) : zone calculée s'ils en manquent.
  const matched = new Set(match.byInfrabel.values());
  const others = state.crossings
    .filter((c) => !matched.has(c.id) && c.zoneSource !== "baco" && c.zoneSource !== "manuel")
    .map((c) => ({ id: c.id, zone: crossingZone(c, zoned), before: c.zone }))
    .filter((c) => c.zone !== c.before)
    .map(({ id, zone }) => ({ id, zone }));
  await inBatches(others, 400, (batch) => internal("network/crossing-zones", { items: batch }));
  const how = [...match.how.values()];
  summary.crossings = {
    infrabel: infra.length,
    matched: match.byInfrabel.size,
    byNumber: how.filter((h) => h === "numero").length,
    byProximity: how.filter((h) => h === "proximite").length,
    created: totals.created,
    updated: totals.updated,
    conflicts: totals.conflicts,
    deactivated: fin.deactivated,
    bkEstimated,
  };
  return summary;
}
