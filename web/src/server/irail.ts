import "server-only";

import {
  ddmmyy,
  trainLabel,
  type Board,
  type BoardRow,
  type Composition,
  type Disturbance,
  type Station,
  type Train,
} from "@/lib/ops/irail";

import { env } from "./env";

// Client iRail côté serveur (le navigateur ne parle qu'au domaine CSM) : User-Agent identifiant CSM (exigé par
// iRail), cache mémoire par requête, regroupement des requêtes identiques en vol, au plus 3 requêtes par seconde
// vers iRail (règle d'usage), délai de 5 s. La dernière réponse reste servie si iRail ne répond plus.

const TTL = {
  stations: 24 * 3600_000,
  board: 20_000,
  train: 20_000,
  composition: 300_000,
  disturbances: 300_000,
};
const STALE_MAX = 30 * 60_000;
const MAX_ENTRIES = 500;

type Entry = { at: number; value: unknown };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
let slots: number[] = [];

export class IrailError extends Error {}

async function throttle() {
  for (;;) {
    const now = Date.now();
    slots = slots.filter((t) => now - t < 1000);
    if (slots.length < 3) {
      slots.push(now);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000 - (now - (slots[0] ?? now)) + 5));
  }
}

async function fetchJson(path: string): Promise<unknown> {
  await throttle();
  const res = await fetch(`${env.IRAIL_URL}${path}`, {
    headers: { "user-agent": env.CSM_USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (res.status === 404) throw new IrailError("introuvable");
  if (!res.ok) throw new IrailError(`iRail ${res.status}`);
  return res.json();
}

/** Lecture avec cache ; `stale` = donnée plus ancienne que le TTL servie faute de réponse d'iRail. */
async function cached<T>(
  key: string,
  ttl: number,
  load: () => Promise<T>,
): Promise<{ value: T; stale: boolean }> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return { value: hit.value as T, stale: false };
  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  try {
    const value = await p;
    cache.delete(key);
    cache.set(key, { at: Date.now(), value });
    if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    return { value, stale: false };
  } catch (e) {
    if (
      hit &&
      Date.now() - hit.at < STALE_MAX &&
      !(e instanceof IrailError && e.message === "introuvable")
    )
      return { value: hit.value as T, stale: true };
    throw e;
  }
}

const s = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const yes = (v: unknown) => v === "1" || v === 1 || v === true;
const list = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v)
    ? (v as Record<string, unknown>[])
    : v && typeof v === "object"
      ? [v as Record<string, unknown>]
      : [];
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const shortId = (v: unknown) => s(v).replace(/^BE\.NMBS\./, "");

export async function stations(): Promise<Station[]> {
  const { value } = await cached("stations", TTL.stations, async () => {
    const raw = obj(await fetchJson("/stations/?format=json&lang=fr"));
    return list(raw.station)
      .map((st) => ({ id: s(st.id), name: s(st.name), lat: n(st.locationY), lon: n(st.locationX) }))
      .filter((st) => /^BE\.NMBS\.\d{9}$/.test(st.id) && st.name);
  });
  return value;
}

export async function board(opts: {
  stationId: string;
  kind: "departure" | "arrival";
  day: string;
  time: string;
}): Promise<{ board: Board; stale: boolean }> {
  const q = `id=${encodeURIComponent(opts.stationId)}&arrdep=${opts.kind}&date=${ddmmyy(opts.day)}&time=${opts.time.replace(":", "")}`;
  const { value, stale } = await cached(`board:${q}`, TTL.board, async () => {
    const raw = obj(await fetchJson(`/liveboard/?${q}&format=json&lang=fr`));
    const group = obj(opts.kind === "departure" ? raw.departures : raw.arrivals);
    const items = list(opts.kind === "departure" ? group.departure : group.arrival);
    const rows: BoardRow[] = items.map((d) => {
      const vi = obj(d.vehicleinfo);
      const train = shortId(d.vehicle) || `${s(vi.type)}${s(vi.number)}`;
      return {
        train,
        label: s(vi.shortname) || trainLabel(train),
        other: s(d.station),
        at: n(d.time) * 1000,
        delayMin: Math.round(n(d.delay) / 60),
        cancelled: yes(d.canceled),
        left: yes(d.left),
        platform: s(d.platform),
        platformChanged: s(obj(d.platforminfo).normal) === "0",
        extra: yes(d.isExtra),
        occupancy: s(obj(d.occupancy).name),
      };
    });
    const info = obj(raw.stationinfo);
    return {
      station: s(info.name) || s(raw.station),
      stationId: s(info.id) || opts.stationId,
      kind: opts.kind,
      rows,
      fetchedAt: Date.now(),
    } satisfies Board;
  });
  return { board: value, stale };
}

export async function train(id: string, day: string): Promise<{ train: Train; stale: boolean }> {
  const q = `id=BE.NMBS.${encodeURIComponent(id)}&date=${ddmmyy(day)}`;
  const { value, stale } = await cached(`train:${q}`, TTL.train, async () => {
    const raw = obj(await fetchJson(`/vehicle/?${q}&format=json&lang=fr`));
    const vi = obj(raw.vehicleinfo);
    const stops = list(obj(raw.stops).stop).map((st) => ({
      station: s(st.station),
      stationId: s(obj(st.stationinfo).id),
      at: n(st.scheduledDepartureTime || st.time) * 1000,
      arrivalAt: n(st.scheduledArrivalTime || st.time) * 1000,
      delayMin: Math.round(n(st.delay) / 60),
      cancelled: yes(st.canceled),
      left: yes(st.left),
      arrived: yes(st.arrived),
      platform: s(st.platform),
      platformChanged: s(obj(st.platforminfo).normal) === "0",
      extra: yes(st.isExtraStop),
    }));
    const t = shortId(raw.vehicle) || id;
    return {
      train: t,
      label: s(vi.shortname) || trainLabel(t),
      day,
      stops,
      fetchedAt: Date.now(),
    } satisfies Train;
  });
  return { train: value, stale };
}

export async function composition(id: string): Promise<Composition> {
  const { value } = await cached(`composition:${id}`, TTL.composition, async () => {
    const raw = obj(
      await fetchJson(`/composition/?id=${encodeURIComponent(id)}&format=json&lang=fr`),
    );
    const segments = list(obj(obj(raw.composition).segments).segment).map((seg) => ({
      from: s(obj(seg.origin).name),
      to: s(obj(seg.destination).name),
      units: list(obj(obj(seg.composition).units).unit).map((u) => {
        const m = obj(u.materialType);
        return {
          type: [s(m.parent_type), s(m.sub_type)].filter(Boolean).join(" "),
          seats1: n(u.seatsFirstClass) + n(u.seatsCoupeFirstClass),
          seats2: n(u.seatsSecondClass) + n(u.seatsCoupeSecondClass),
          prm: yes(u.hasPrmSection),
          bike: yes(u.hasBikeSection),
          toilets: yes(u.hasToilets),
          airco: yes(u.hasAirco),
        };
      }),
    }));
    return { segments } satisfies Composition;
  });
  return value;
}

export async function disturbances(): Promise<{ items: Disturbance[]; stale: boolean }> {
  const { value, stale } = await cached("disturbances", TTL.disturbances, async () => {
    const raw = obj(await fetchJson("/disturbances/?format=json&lang=fr"));
    return list(raw.disturbance).map((d) => ({
      id: `${s(d.timestamp)}-${s(d.id)}`,
      title: s(d.title).slice(0, 300),
      description: s(d.description).slice(0, 3000),
      kind: s(d.type) === "planned" ? ("travaux" as const) : ("incident" as const),
      at: n(d.timestamp) * 1000,
    }));
  });
  return { items: value, stale };
}

/** Réservé aux tests. */
export function resetIrailCache() {
  cache.clear();
  inflight.clear();
  slots = [];
}
