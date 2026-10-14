import "server-only";

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { addDays, brusselsDay } from "@/lib/orders/time";
import { csvReader } from "@/lib/timetable/csv";
import { timetableBuilder } from "@/lib/timetable/gtfs";
import { opPointsFrom, pathCollector, type TrainPath } from "@/lib/timetable/infrabel";
import {
  buildRailLines,
  sectionsFrom,
  stationIndex,
  type LineSection,
} from "@/lib/timetable/lines";
import { referenceWeek } from "@/lib/timetable/model";
import { buildStations } from "@/lib/timetable/stations";
import { env } from "@/server/env";

import { entryLines, zipEntries } from "./zip";

// Import du référentiel des relations de trains (14 oct. 2026), lancé chaque matin par `scheduler.ts` ou par un admin :
//  1. Infrabel (CC0) : points opérationnels + ponctualité J-1 → chemin de chaque train (relation, lignes), accumulé dans
//     PocketBase ; au premier passage (ou s'il en manque), fin du fichier mensuel précédent pour couvrir une semaine.
//  2. GTFS SNCB : semaine de référence (aujourd'hui + 6 jours), arrêts et passages, jointure sur le n° de train.
//  3. Écriture par lots dans PocketBase (routes internes), puis suppression de ce qui n'existe plus.
//  4. Lignes (Ressources › Lignes) : gares de chaque ligne dans l'ordre, déduites des chemins Infrabel ; sens et points
//     kilométriques par les sections de lignes Infrabel (« lijnsecties », CC0 ; facultatif : sans elles, ordre gardé).

const INFRABEL = "https://opendata.infrabel.be/api/explore/v2.1/catalog/datasets";
const OP_URL = `${INFRABEL}/operationele-punten-van-het-netwerk/exports/csv?delimiter=%3B&select=geo_point_2d,symbolicname,longnamedutch,commerciallongnamefrench,commerciallongnamedutch,classification`;
const D1_URL = `${INFRABEL}/ruwe-gegevens-van-stiptheid-d-1/exports/csv?delimiter=%3B`;
const SECTIONS_URL = `${INFRABEL}/lijnsecties/exports/csv?delimiter=%3B&select=label,symnamefrom,symnameto,mfrom,mto`;
const MONTHLY_URL = (ym: string) =>
  `https://fr.ftp.opendatasoft.com/infrabel/PunctualityHistory/Data_raw_punctuality_${ym}.csv`;
/** Fin du fichier mensuel lue au rattrapage : ~60 Mo ≈ les 5 à 6 derniers jours du mois. */
const MONTHLY_TAIL = 60_000_000;
/** Ligne CSV plus longue : ignorée (sources de confiance, mais rien n'est lu sans borne). */
const MAX_LINE = 1_000_000;

export type TimetableStatus = {
  state?: "running" | "ok" | "error";
  trigger?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  error?: string;
  step?: string;
  feedVersion?: string;
  /** En-tête Last-Modified du GTFS importé : un GTFS plus récent relance l'import (scheduler). */
  gtfsModified?: string;
  window?: [string, string];
  d1Day?: string;
  paths?: number;
  services?: number;
  relations?: number;
  stations?: number;
  lines?: number;
  lastOkAt?: string;
  /** Mois Infrabel (AAAAMM) déjà lu en rattrapage : une fois par mois, jamais bloquant. */
  backfill?: string;
  warning?: string;
};

async function internal<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${env.PB_URL.replace(/\/$/, "")}/api/csm/timetable/${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", "x-csm-internal": env.CSM_INTERNAL_SECRET },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  });
  const body = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(body.message ?? `PocketBase : HTTP ${res.status} (${path}).`);
  return body;
}

export const readTimetableStatus = () => internal<TimetableStatus>("status");
const setStatus = (patch: TimetableStatus) =>
  internal<TimetableStatus>("status", { body: { patch } });

/** Import possible : secret interne posé (routes PocketBase fermées sinon). */
export function timetableConfigured(): boolean {
  return env.CSM_INTERNAL_SECRET.length >= 32;
}

/** Lignes d'une réponse HTTP, en flux (fichiers Infrabel de 10 à 60 Mo). */
async function* responseLines(res: Response): AsyncIterable<string> {
  if (!res.body) return;
  const decoder = new TextDecoder();
  let rest = "";
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    rest += decoder.decode(chunk, { stream: true });
    let i: number;
    while ((i = rest.indexOf("\n")) >= 0) {
      yield rest.slice(0, i).replace(/\r$/, "");
      rest = rest.slice(i + 1);
    }
    if (rest.length > MAX_LINE) throw new Error("Ligne CSV démesurée : lecture arrêtée.");
  }
  rest += decoder.decode();
  if (rest) yield rest.replace(/\r$/, "");
}

async function get(
  url: string,
  headers: Record<string, string> = {},
  timeout = 120_000,
): Promise<Response> {
  const res = await fetch(url, {
    headers: { "user-agent": env.CSM_USER_AGENT, ...headers },
    cache: "no-store",
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok && res.status !== 206) throw new Error(`${new URL(url).host} : HTTP ${res.status}.`);
  return res;
}

async function readOps() {
  const rows: Record<string, string>[] = [];
  const read = csvReader(";");
  for await (const line of responseLines(await get(OP_URL))) {
    const r = read(line);
    if (r) rows.push(r);
  }
  const ops = opPointsFrom(rows);
  if (ops.size < 500) throw new Error("Points opérationnels Infrabel incomplets.");
  return ops;
}

/** Ponctualité J-1 (fichier complet) → chemins. */
async function readD1(collector: ReturnType<typeof pathCollector>) {
  const read = csvReader(";");
  let day = "";
  for await (const line of responseLines(await get(D1_URL, {}, 180_000))) {
    const r = read(line);
    if (!r) continue;
    collector.add(r);
    if (!day && r.datdep) day = r.datdep;
  }
  return day;
}

/** Fin d'un fichier mensuel Infrabel (AAAAMM, requête partielle), en-tête lu à part. Rend faux s'il n'est pas publié. */
async function readMonthlyTail(
  ym: string,
  collector: ReturnType<typeof pathCollector>,
): Promise<boolean> {
  const url = MONTHLY_URL(ym);
  const head = await fetch(url, {
    headers: { "user-agent": env.CSM_USER_AGENT, range: "bytes=0-4095" },
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (head.status === 404) return false;
  // Sans réponse partielle, le serveur enverrait 350 Mo : refus.
  if (head.status !== 206) {
    await head.body?.cancel();
    throw new Error(`${new URL(url).host} : réponse partielle attendue (HTTP ${head.status}).`);
  }
  const header = (await head.text()).split("\n")[0]!.replace(/\r$/, "");
  const read = csvReader(",");
  read(header);
  const res = await get(url, { range: `bytes=-${MONTHLY_TAIL}` }, 300_000);
  if (res.status !== 206) {
    await res.body?.cancel();
    throw new Error(`${new URL(url).host} : réponse partielle attendue (HTTP ${res.status}).`);
  }
  let first = true;
  for await (const line of responseLines(res)) {
    if (first) {
      first = false; // ligne coupée par la requête partielle
      continue;
    }
    const r = read(line);
    if (r) collector.add(r);
  }
  return true;
}

/** Sections de lignes Infrabel (sens et points kilométriques des lignes). */
async function readSections(): Promise<LineSection[]> {
  const rows: Record<string, string>[] = [];
  const read = csvReader(";");
  for await (const line of responseLines(await get(SECTIONS_URL))) {
    const r = read(line);
    if (r) rows.push(r);
  }
  return sectionsFrom(rows);
}

/** AAAAMM du mois qui précède `day` de `back` mois. */
function monthBefore(day: string, back: number): string {
  let d = `${day.slice(0, 7)}-01`;
  for (let i = 0; i < back; i++) d = `${addDays(d, -1).slice(0, 7)}-01`;
  return d.slice(0, 7).replace("-", "");
}

/** GTFS téléchargé sur disque puis lu entrée par entrée. */
async function readGtfs(dates: string[]) {
  const dir = await mkdtemp(join(tmpdir(), "csm-gtfs-"));
  const file = join(dir, "gtfs.zip");
  try {
    const res = await get(env.CSM_GTFS_URL, {}, 300_000);
    if (!res.body) throw new Error("GTFS vide.");
    const lastModified = res.headers.get("last-modified") ?? "";
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(file));
    const entries = await zipEntries(file);
    const builder = timetableBuilder(dates);
    let feedVersion = "";
    const each = async (name: string, fn: (r: Record<string, string>) => void) => {
      const entry = entries.get(name);
      if (!entry) throw new Error(`GTFS : ${name} absent.`);
      const read = csvReader(",");
      for await (const line of entryLines(file, entry)) {
        const r = read(line);
        if (r) fn(r);
      }
    };
    if (entries.has("feed_info.txt"))
      await each("feed_info.txt", (r) => {
        feedVersion ||= r.feed_version ?? "";
      });
    await each("routes.txt", builder.addRoute);
    await each("calendar.txt", builder.addCalendar);
    await each("calendar_dates.txt", builder.addCalendarDate);
    await each("trips.txt", builder.addTrip);
    await each("stops.txt", builder.addStop);
    if (entries.has("translations.txt")) await each("translations.txt", builder.addTranslation);
    await each("stop_times.txt", builder.addStopTime);
    return { builder, feedVersion, lastModified };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const toDay = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

const sig = (o: unknown) =>
  createHash("sha1").update(JSON.stringify(o)).digest("base64url").slice(0, 16);

async function inBatches<T>(items: T[], size: number, fn: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size));
}

// Un seul import par serveur : le module est compilé deux fois (instrumentation et action), d'où `globalThis`. Le verrou
// PocketBase (`state: "running"` refusé pendant 30 min) couvre le reste (deux serveurs, redémarrage).
const g = globalThis as { __csmTimetableRun?: Promise<TimetableStatus> | null };

/** Lance l'import (un seul à la fois) ; rend l'état final. */
export function runTimetableImport(trigger: string): Promise<TimetableStatus> {
  if (g.__csmTimetableRun) return g.__csmTimetableRun;
  const run = doImport(trigger).finally(() => {
    g.__csmTimetableRun = null;
  });
  g.__csmTimetableRun = run;
  return run;
}

export function timetableRunning(): boolean {
  return !!g.__csmTimetableRun;
}

/** Durée après laquelle un import « en cours » est tenu pour interrompu (redéploiement en plein import). */
export const STALE_RUN_MS = 30 * 60_000;

async function doImport(trigger: string): Promise<TimetableStatus> {
  const t0 = Date.now();
  const startedAt = new Date().toISOString();
  let step = "infrabel";
  try {
    await setStatus({ state: "running", trigger, startedAt, step, error: "", warning: "" });
  } catch (e) {
    // Verrou PocketBase : un autre import tourne déjà (autre copie du serveur) — rien à faire.
    return { state: "running", error: e instanceof Error ? e.message : String(e) };
  }
  try {
    const previous = await readTimetableStatus().catch(() => ({}) as TimetableStatus);
    const ops = await readOps();
    const collector = pathCollector();
    const d1Day = await readD1(collector);
    let paths: TrainPath[] = collector.paths(ops);
    const pushPaths = (list: TrainPath[]) =>
      inBatches(list, 400, (items) => internal("paths", { body: { items } }));
    await pushPaths(paths);

    // Rattrapage (une fois par mois) : fin du mois précédent, pour couvrir les trains du week-end dès le premier
    // passage. Jamais bloquant : le fichier paraît vers le 5 du mois suivant (404 avant), essai du mois d'avant.
    let warning = "";
    let backfill = previous.backfill ?? "";
    const today = brusselsDay();
    if (backfill !== monthBefore(today, 1)) {
      step = "infrabel-mensuel";
      await setStatus({ step });
      for (const ym of [monthBefore(today, 1), monthBefore(today, 2)]) {
        if (ym === backfill) break;
        try {
          const back = pathCollector();
          if (!(await readMonthlyTail(ym, back))) continue;
          // Le J-1 (plus récent) garde la main : l'upsert ne remplace jamais un jour par un jour plus ancien.
          await pushPaths(back.paths(ops));
          backfill = ym;
          break;
        } catch (e) {
          warning =
            `Rattrapage Infrabel ${ym} : ${e instanceof Error ? e.message : String(e)}`.slice(
              0,
              300,
            );
          break;
        }
      }
    }
    paths = (await internal<{ items: TrainPath[] }>("paths")).items;

    step = "gtfs";
    await setStatus({ step, paths: paths.length, d1Day });
    const days = referenceWeek(today);
    const { builder, feedVersion, lastModified } = await readGtfs(days);
    const { services, relations } = builder.build(paths);
    if (services.length < 1000)
      throw new Error(`GTFS : ${services.length} trains seulement sur la semaine.`);

    step = "ecriture";
    await setStatus({ step });
    await inBatches(services, 300, (batch) =>
      internal("services", { body: { items: batch.map((s) => ({ ...s, sig: sig(s) })) } }),
    );
    await inBatches(relations, 100, (batch) =>
      internal("relations", { body: { items: batch.map((r) => ({ ...r, sig: sig(r) })) } }),
    );
    // Référentiel des gares (district gardé s'il a été modifié à la main).
    const stations = buildStations(builder.stationSeeds(services), ops, paths);
    await inBatches(stations, 300, (batch) =>
      internal("stations", { body: { items: batch.map((st) => ({ ...st, sig: sig(st) })) } }),
    );
    // Lignes : gares dans l'ordre, tirées de tous les chemins Infrabel accumulés (60 jours).
    step = "lignes";
    await setStatus({ step });
    let sections: LineSection[] = [];
    try {
      sections = await readSections();
    } catch (e) {
      warning ||=
        `Sections de lignes Infrabel : ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
    }
    const lines = buildRailLines(paths, { station: stationIndex(stations), sections });
    await inBatches(lines, 50, (batch) =>
      internal("lines", { body: { items: batch.map((l) => ({ ...l, sig: sig(l) })) } }),
    );
    // Propositions de district pour les gares qui n'en ont pas (validées ensuite par un coordinateur).
    await internal("../stations/suggest", { body: {} });
    await internal("finish", {
      body: {
        services: services.map((s) => s.key),
        relations: relations.map((r) => r.key),
        lines: lines.map((l) => l.line),
      },
    });
    const finishedAt = new Date().toISOString();
    return await setStatus({
      state: "ok",
      step: "",
      finishedAt,
      lastOkAt: finishedAt,
      durationMs: Date.now() - t0,
      feedVersion: /^\d{4}-\d{2}-\d{2}$/.test(feedVersion) ? feedVersion : "",
      gtfsModified: lastModified.slice(0, 64),
      window: [toDay(days[0]!), toDay(days[6]!)],
      d1Day: /^\d{4}-\d{2}-\d{2}$/.test(d1Day) ? d1Day : "",
      paths: paths.length,
      services: services.length,
      relations: relations.length,
      stations: stations.length,
      lines: lines.length,
      backfill,
      warning,
    });
  } catch (e) {
    const error = `${step} : ${e instanceof Error ? e.message : String(e)}`.slice(0, 500);
    console.error("[timetable]", error);
    return await setStatus({
      state: "error",
      error,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
    }).catch(() => ({ state: "error" as const, error }));
  }
}

/** Date de publication du GTFS en ligne (requête HEAD), « » si inconnue. */
export async function remoteGtfsModified(): Promise<string> {
  const res = await fetch(env.CSM_GTFS_URL, {
    method: "HEAD",
    headers: { "user-agent": env.CSM_USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  return res.ok ? (res.headers.get("last-modified") ?? "").slice(0, 64) : "";
}
