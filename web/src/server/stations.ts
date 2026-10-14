import "server-only";

import type PocketBase from "pocketbase";

import { can } from "@/lib/permissions";
import { stationCandidates, stationTerms, type StationRef } from "@/lib/stations/search";

import { getCurrentUser } from "./auth";
import { createPb } from "./pocketbase";
import { readSessionToken } from "./session";

// Recherche de gare tolérante côté serveur (11 oct. 2026) : la saisie est résolue en noms candidats (référentiel PtCar
// — abréviation, nom FR / NL — et gares des lignes), puis les filtres PocketBase cherchent ces noms. Les référentiels
// sont lus avec le jeton de l'agent (règles PocketBase) et gardés 10 minutes en mémoire : données d'exploitation, sans
// donnée personnelle. Le référentiel PtCar n'est utilisé que pour un agent qui a `ptcar:read`.

const TTL = 10 * 60_000;
type Entry = { at: number; refs: StationRef[] };
const store = globalThis as unknown as {
  __csmStations?: { ptcar?: Entry; lines?: Entry; stations?: Entry };
};
const mem = (store.__csmStations ??= {});

const str = (v: unknown) => (typeof v === "string" ? v : "");

async function load(kind: "ptcar" | "lines" | "stations", pb: PocketBase): Promise<StationRef[]> {
  const hit = mem[kind];
  if (hit && Date.now() - hit.at < TTL) return hit.refs;
  try {
    const refs: StationRef[] =
      kind === "stations"
        ? // Référentiel des gares (14 oct. 2026) : noms FR / NL et alias (gares frontière : « Maubeuge » → « Maubeuge (FR) »).
          (
            await pb
              .collection("stations")
              .getFullList({ fields: "abbr,name,name_nl,aliases", batch: 1000 })
          ).map((r) => ({
            abbr: str(r.abbr),
            names: [
              str(r.name),
              str(r.name_nl),
              ...(Array.isArray(r.aliases) ? r.aliases.map(str) : []),
            ],
          }))
        : kind === "ptcar"
          ? (
              await pb
                .collection("ptcar")
                .getFullList({ fields: "abbr,name_fr,name_nl", batch: 1000 })
            ).map((r) => ({ abbr: str(r.abbr), names: [str(r.name_fr), str(r.name_nl)] }))
          : // Gares des lignes du référentiel des trains (14 oct. 2026, ex-table BACO line_stations).
            [
              ...new Set(
                (
                  await pb.collection("rail_lines").getFullList({ fields: "stations", batch: 1000 })
                ).flatMap((r) =>
                  Array.isArray(r.stations)
                    ? r.stations.map((s: { n?: unknown }) => str(s?.n)).filter(Boolean)
                    : [],
                ),
              ),
            ].map((s) => ({ names: [s] }));
    // Un référentiel vide (accès refusé, base neuve) n'est pas gardé : nouvel essai à la prochaine recherche.
    if (refs.length) mem[kind] = { at: Date.now(), refs };
    return refs;
  } catch {
    return hit?.refs ?? [];
  }
}

/** Termes de recherche d'une gare saisie (saisie + noms candidats), pour `stationFilter` ou `stationMatchesAny`. */
export async function resolveStationTerms(query: string | undefined, max = 12): Promise<string[]> {
  const q = (query ?? "").trim().slice(0, 60);
  if (!q) return [];
  const user = await getCurrentUser();
  if (!user) return [q];
  const pb = createPb(await readSessionToken());
  const [ptcar, lines, stations] = await Promise.all([
    can(user, "ptcar:read") ? load("ptcar", pb) : Promise.resolve([] as StationRef[]),
    load("lines", pb),
    load("stations", pb),
  ]);
  return stationTerms(q, stationCandidates(q, [...stations, ...ptcar, ...lines], max), max);
}

/**
 * Filtre PocketBase « l'un des champs contient l'un des termes », paramètres liés (`pb.filter`). Vide sans terme.
 * `extra` : conditions ajoutées au OU avec la saisie brute (train, n° de dossier…).
 */
export function stationFilter(
  pb: PocketBase,
  fields: string[],
  terms: string[],
  extra: { fields: string[]; q: string } | null = null,
): string {
  const params: Record<string, string> = {};
  const ors: string[] = [];
  terms.forEach((t, i) => {
    params[`st${i}`] = t;
    for (const f of fields) ors.push(`${f} ~ {:st${i}}`);
  });
  if (extra?.q) {
    params.stq = extra.q;
    for (const f of extra.fields) ors.push(`${f} ~ {:stq}`);
  }
  return ors.length ? pb.filter(`(${ors.join(" || ")})`, params) : "";
}

/** Filtre district (un ou plusieurs codes) : la gare de départ OU d'arrivée du trajet est dans l'un d'eux. */
export function districtFilter(pb: PocketBase, filter: string): string {
  const codes = filter.split(",").filter(Boolean);
  const params: Record<string, string> = {};
  const ors = codes.map((c, i) => {
    params[`d${i}`] = c;
    return `district = {:d${i}} || arr_district = {:d${i}}`;
  });
  return ors.length ? pb.filter(`(${ors.join(" || ")})`, params) : "";
}
