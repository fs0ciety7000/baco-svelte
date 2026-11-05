// Annuaire v2 (5 nov. 2026) : Service / Fonction / Zone séparés (`pocketbase/pb_migrations/1760005200_directory_v2.js`).
// Logique pure partagée client / serveur, testée par `directory-model.test.ts` :
//   - `mapLegacy` : miroir de `pocketbase/pb_hooks/lib/directory.js` (anciens champs BACO → service / fonction / zone ;
//     le test compare les deux sur les mêmes fixtures) ;
//   - libellés de zone (`zoneLabel`), zones « à moi » (districts du jour) ;
//   - regroupements de la page Contacts : par zone puis service (`groupByZone`), par service puis zone (`groupByService`),
//     fonction repliée au-delà de 3 contacts (« SPI (8) »).

/** Service de l'annuaire (`directory_services`). */
export type DirectoryService = { key: string; label: string; sort: number; functions: string[] };

/** Zone connue (`spi_zones`) : code, nom de la gare de référence, district, couleur de la carte. */
export type DirectoryZone = { code: string; name: string; district: string; color: string };

export type LegacyMapping = { service: string; function: string; zone: string; hours?: string };

const FUNCTION_MAX = 60;
const ZONE_MAX = 60;
export const B_CLEAN_HOURS = "9 h – 17 h";
/** Clé de section des contacts sans zone / sans service. */
export const NO_ZONE = "";
export const NO_SERVICE = "";

const clean = (v: unknown) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const fold = (v: unknown) => clean(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Code de zone en majuscules (« fms » → « FMS » ; « FR / LK » gardé tel quel). */
export function normZone(zone: unknown): string {
  return clean(zone).toUpperCase().slice(0, ZONE_MAX);
}

const ZONE_BY_NAME: Record<string, string> = {
  mons: "FMS",
  charleroi: "FCR",
  tournai: "FTY",
  namur: "FNR",
  liege: "FL",
};
const zoneCode = (word: string) => ZONE_BY_NAME[fold(word)] ?? normZone(word);

function out(service: string, fn: string, zone: string, hours?: string): LegacyMapping {
  const r: LegacyMapping = {
    service,
    function: clean(fn).slice(0, FUNCTION_MAX),
    zone: normZone(zone),
  };
  if (hours) r.hours = hours;
  return r;
}

/** Anciens champs BACO → service / fonction / zone (miroir exact de `lib/directory.js`). */
export function mapLegacy(category: unknown, group: unknown, zone: unknown): LegacyMapping {
  const c = fold(category);
  const g = clean(group);
  const gf = fold(group);
  const z = normZone(zone);

  if (gf === "france") return out("etranger", "France", z);
  if (gf === "help desk" || gf === "helpdesk") return out("support", "Help desk", z);
  if (gf === "borne pmr" || c === "borne pmr") return out("pmr", "Borne PMR", z);

  if (c === "mia") {
    const m = /^(spi|cpi|opi|pa)\s+(.+)$/i.exec(g);
    if (m) return out("gares", m[1]!.toUpperCase(), z || m[2]!);
    if (/^tl\s*\/\s*mpi$/i.test(g)) return out("gares", "TL/MPI", z);
    return out("", g, z);
  }
  if (c === "rcc-occ" && g) return out("trafic", gf === "repartiteurs" ? "Répartiteurs" : g, z);
  if (c === "b-to") {
    const m = /^(operator|collaborator)\b.*?\bzone\s+(\S+)\s*$/i.exec(g);
    if (m)
      return out(
        "triage",
        m[1]![0]!.toUpperCase() + m[1]!.slice(1).toLowerCase(),
        z || zoneCode(m[2]!),
      );
    const zm = /^zone\s+(\S+)$/i.exec(g);
    if (zm) return out("triage", "", z || zoneCode(zm[1]!));
    return out("triage", g, z);
  }
  if (c === "autre") {
    if (gf === "pmr") return out("pmr", "PMR", z);
    if (/^b-clean up\b/i.test(g)) return out("support", "B-Clean UP", z, B_CLEAN_HOURS);
    if (gf === "charleroi") return out("support", "", z || "FCR");
    return out("support", g, z);
  }
  return out("", g, z);
}

// ---------------------------------------------------------------------------------------------------
// Zones

/** Libellé d'une zone : « FMS · Mons » si elle est connue, sinon le code tel quel (« FB », « FR / LK »). */
export function zoneLabel(code: string, zones: ReadonlyMap<string, DirectoryZone>): string {
  if (!code) return "Sans zone";
  const z = zones.get(code);
  return z ? `${z.code} · ${z.name}` : code;
}

/** Zones dont le district fait partie des districts de l'agent (districts du jour, sinon permanents). */
export function zonesOfDistricts(zones: readonly DirectoryZone[], districts: readonly string[]) {
  const set = new Set(districts.map((d) => d.toUpperCase()));
  return zones.filter((z) => z.district && set.has(z.district)).map((z) => z.code);
}

/**
 * Filtre de zone de la page : `null` = toutes les zones ; sinon les codes retenus (`""` = contacts sans zone). « Mes
 * zones » = les zones des districts de l'agent PLUS les contacts sans zone (numéros généraux : help desk, RTS ROC…).
 */
export type ZoneFilter = string[] | null;

export function mineFilter(mine: readonly string[]): ZoneFilter {
  return mine.length ? [...mine, NO_ZONE] : null;
}

export function zoneMatches(entryZone: string, filter: ZoneFilter): boolean {
  return filter === null || filter.includes(entryZone);
}

/** Même ensemble de zones (ordre indifférent). */
export function sameZones(a: ZoneFilter, b: ZoneFilter): boolean {
  if (a === null || b === null) return a === b;
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/**
 * Paramètre d'URL `zone` (répété) → filtre. Absent = « Mes zones » (ou toutes si l'agent n'a pas de district) ;
 * `tous` = toutes ; `-` = sans zone ; sinon codes (normalisés).
 */
export function parseZoneParam(raw: readonly string[], mine: readonly string[]): ZoneFilter {
  const vals = raw.map((v) => v.trim()).filter(Boolean);
  if (!vals.length) return mineFilter(mine);
  if (vals.some((v) => v.toLowerCase() === "tous")) return null;
  return [...new Set(vals.map((v) => (v === "-" ? NO_ZONE : normZone(v))))].slice(0, 40);
}

/** Filtre → valeurs du paramètre `zone` (vide = défaut « Mes zones »). */
export function zoneParam(filter: ZoneFilter, mine: readonly string[]): string[] {
  if (sameZones(filter, mineFilter(mine))) return [];
  if (filter === null) return ["tous"];
  return filter.map((z) => (z === NO_ZONE ? "-" : z));
}

// ---------------------------------------------------------------------------------------------------
// Regroupements

/** Ce dont le regroupement a besoin d'une fiche. */
export type Groupable = {
  id: string;
  name: string;
  service: string;
  function: string;
  zone: string;
};

/** Ligne d'une sous-section : une fiche, ou une fonction repliée (plus de `FOLD_OVER` fiches). */
export type GroupItem<T> =
  { kind: "contact"; entry: T } | { kind: "fold"; fn: string; entries: T[] };

export type SubGroup<T> = { key: string; label: string; count: number; items: GroupItem<T>[] };
export type Section<T> = {
  key: string;
  label: string;
  count: number;
  /** Zone connue : couleur de la carte et district (repère de section). */
  color?: string;
  district?: string;
  groups: SubGroup<T>[];
};

/** Une fonction est repliée dans une sous-section au-delà de 3 fiches. */
export const FOLD_OVER = 3;

const byName = (a: Groupable, b: Groupable) => a.name.localeCompare(b.name, "fr");

/** Ordre des fiches d'une sous-section : ordre des fonctions du service, fonctions inconnues ensuite, puis nom. */
function orderItems<T extends Groupable>(list: T[], service?: DirectoryService): GroupItem<T>[] {
  const rank = new Map((service?.functions ?? []).map((f, i) => [fold(f), i]));
  const fnRank = (f: string) => (f ? (rank.get(fold(f)) ?? 500) : 1000);
  const byFn = new Map<string, T[]>();
  for (const e of list) {
    const k = fold(e.function);
    byFn.set(k, [...(byFn.get(k) ?? []), e]);
  }
  const keys = [...byFn.keys()].sort((a, b) => {
    const ea = byFn.get(a)![0]!.function;
    const eb = byFn.get(b)![0]!.function;
    return fnRank(ea) - fnRank(eb) || ea.localeCompare(eb, "fr");
  });
  const items: GroupItem<T>[] = [];
  for (const k of keys) {
    const entries = byFn.get(k)!.sort(byName);
    const fn = entries[0]!.function;
    if (fn && entries.length > FOLD_OVER) items.push({ kind: "fold", fn, entries });
    else for (const e of entries) items.push({ kind: "contact", entry: e });
  }
  return items;
}

function serviceOrder(services: readonly DirectoryService[]) {
  const by = new Map(services.map((s) => [s.key, s]));
  const rank = (k: string) => {
    const s = by.get(k);
    return s ? s.sort : k ? 9000 : 9999;
  };
  return {
    by,
    cmp: (a: string, b: string) =>
      rank(a) - rank(b) || (by.get(a)?.label ?? a).localeCompare(by.get(b)?.label ?? b, "fr"),
    label: (k: string) => by.get(k)?.label ?? (k ? k : "À classer"),
  };
}

function zoneOrder(zones: ReadonlyMap<string, DirectoryZone>, mine: readonly string[]) {
  const mineSet = new Set(mine);
  // Mes zones d'abord, puis les zones connues, puis les codes inconnus, « Sans zone » en dernier.
  const tier = (code: string) => (!code ? 3 : mineSet.has(code) ? 0 : zones.has(code) ? 1 : 2);
  return (a: string, b: string) =>
    tier(a) - tier(b) || zoneLabel(a, zones).localeCompare(zoneLabel(b, zones), "fr");
}

function bucket<T>(list: T[], key: (e: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const e of list) m.set(key(e), [...(m.get(key(e)) ?? []), e]);
  return m;
}

/** Vue « Par zone » : une section par zone, des sous-sections par service. */
export function groupByZone<T extends Groupable>(
  entries: readonly T[],
  ctx: {
    services: readonly DirectoryService[];
    zones: ReadonlyMap<string, DirectoryZone>;
    mine?: readonly string[];
  },
): Section<T>[] {
  const so = serviceOrder(ctx.services);
  const zones = bucket([...entries], (e) => e.zone);
  return [...zones.keys()].sort(zoneOrder(ctx.zones, ctx.mine ?? [])).map((zk) => {
    const list = zones.get(zk)!;
    const z = ctx.zones.get(zk);
    const svc = bucket(list, (e) => e.service);
    return {
      key: zk,
      label: zoneLabel(zk, ctx.zones),
      count: list.length,
      ...(z ? { color: z.color, district: z.district } : {}),
      groups: [...svc.keys()].sort(so.cmp).map((sk) => ({
        key: sk,
        label: so.label(sk),
        count: svc.get(sk)!.length,
        items: orderItems(svc.get(sk)!, so.by.get(sk)),
      })),
    };
  });
}

/** Vue « Par service » : une section par service, des sous-sections par zone. */
export function groupByService<T extends Groupable>(
  entries: readonly T[],
  ctx: {
    services: readonly DirectoryService[];
    zones: ReadonlyMap<string, DirectoryZone>;
    mine?: readonly string[];
  },
): Section<T>[] {
  const so = serviceOrder(ctx.services);
  const zo = zoneOrder(ctx.zones, ctx.mine ?? []);
  const svc = bucket([...entries], (e) => e.service);
  return [...svc.keys()].sort(so.cmp).map((sk) => {
    const list = svc.get(sk)!;
    const zones = bucket(list, (e) => e.zone);
    return {
      key: sk,
      label: so.label(sk),
      count: list.length,
      groups: [...zones.keys()].sort(zo).map((zk) => ({
        key: zk,
        label: zoneLabel(zk, ctx.zones),
        count: zones.get(zk)!.length,
        items: orderItems(zones.get(zk)!, so.by.get(sk)),
      })),
    };
  });
}

/** Nombre de fiches par service (segments « Service » de la barre d'outils), `""` = à classer. */
export function serviceCounts(entries: readonly Groupable[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) m.set(e.service, (m.get(e.service) ?? 0) + 1);
  return m;
}

/** Libellés courts des services d'origine (libellé amorcé → libellé court). */
const SHORT: Record<string, [string, string]> = {
  gares: ["Gares & accueil", "Gares & accueil"],
  trafic: ["Trafic RCC-OCC", "Trafic"],
  triage: ["Triage B-TO", "Triage"],
  pmr: ["Assistance PMR", "PMR"],
  support: ["Services support", "Support"],
  etranger: ["Étranger", "Étranger"],
};

/**
 * Libellé court d'un service pour les segments (« Trafic RCC-OCC » → « Trafic ») ; un service ajouté ou renommé dans
 * l'administration garde son libellé.
 */
export function shortServiceLabel(key: string, label: string): string {
  const s = SHORT[key];
  return s && s[0] === label ? s[1] : label;
}

/** « PACO · Mons » : fonction puis nom, sans répéter la fonction si le nom la contient déjà. */
export function contactTitle(e: { name: string; function: string }): string {
  if (!e.function) return e.name;
  return fold(e.name).includes(fold(e.function)) ? e.name : `${e.function} · ${e.name}`;
}
