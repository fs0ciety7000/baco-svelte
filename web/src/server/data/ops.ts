import "server-only";

import type { RecordModel } from "pocketbase";
import { z } from "zod";

import { parseFavorites, type FavoriteStation } from "@/lib/ops/irail";
import { plainText } from "@/lib/ops/chat-markdown";
import { LOG_CATEGORIES, type LogCategory } from "@/lib/ops/log";
import { addDays, brusselsDay, brusselsToUtc, isValidDay } from "@/lib/orders/time";

import { pbForRequest, toPbInstant } from "./orders";

// Données du module Opérations (main courante, notifications, passages à niveau, trains suivis), lues avec le jeton
// de l'agent : les règles PocketBase filtrent (entrées retirées visibles de l'auteur et des coordinateurs, objets
// liés développés seulement si l'agent peut les lire).

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const exp = (r: RecordModel) => (r.expand ?? {}) as Record<string, RecordModel | undefined>;
const pbId = z.string().regex(/^[a-z0-9]{15}$/);

// ---------------------------------------------------------------------------------------------------
// Main courante

export type LinkedObject = {
  kind: "bus" | "taxi" | "pmr" | "pn";
  id: string;
  label: string;
  href: string;
};

export type LogEntry = {
  id: string;
  body: string;
  category: LogCategory;
  occurredAt: string;
  urgent: boolean;
  pinnedUntil: string;
  district: string;
  train: string;
  links: LinkedObject[];
  attachments: string[];
  status: "active" | "retiree";
  retiredReason: string;
  authorId: string;
  authorName: string;
  /** Fichier d'avatar de l'auteur (vide = initiales). */
  authorAvatar: string;
  /** « irail » : message repris automatiquement d'iRail (perturbation, travaux), sans auteur. */
  source: "agent" | "irail";
  editedAt: string;
  created: string;
  updated: string;
  readers: { id: string; name: string }[];
  /** Message d'origine quand celui-ci est une réponse (fil à un niveau). */
  replyTo: { id: string; author: string; excerpt: string } | null;
  /** Nombre de réponses actives (renseigné dans le fil). */
  replyCount: number;
  /** Champs bruts des liens (formulaire de modification). */
  raw: { busOrder: string; taxiOrder: string; pmrAssist: string; levelCrossing: string };
};

function links(r: RecordModel): LinkedObject[] {
  const e = exp(r);
  const out: LinkedObject[] = [];
  const bus = e.bus_order;
  if (bus)
    out.push({
      kind: "bus",
      id: bus.id,
      label: `Bus C3 n° ${num(bus.number) || "—"} · ${str(bus.origin) || "?"} → ${str(bus.destination) || "?"}`,
      href: `/commandes/bus/${bus.id}`,
    });
  else if (str(r.bus_order))
    out.push({ kind: "bus", id: str(r.bus_order), label: "Bus C3 (accès restreint)", href: "" });
  const taxi = e.taxi_order;
  if (taxi)
    out.push({
      kind: "taxi",
      id: taxi.id,
      label: `Taxi n° ${num(taxi.number) || "—"} · ${str(taxi.from_station) || "?"} → ${str(taxi.to_station) || "?"}`,
      href: `/commandes/taxi/${taxi.id}`,
    });
  else if (str(r.taxi_order))
    out.push({ kind: "taxi", id: str(r.taxi_order), label: "Taxi (accès restreint)", href: "" });
  const assist = e.pmr_assist;
  // Prestation : jamais de nom (heure, gare, train seulement).
  if (assist)
    out.push({
      kind: "pmr",
      id: assist.id,
      label: `Prestation ${str(assist.time) || "--:--"} · ${str(assist.station) || "?"}${str(assist.train) ? ` · ${str(assist.train)}` : ""}`,
      href: `/pmr?du=${str(assist.day)}&au=${str(assist.day)}`,
    });
  else if (str(r.pmr_assist))
    out.push({
      kind: "pmr",
      id: str(r.pmr_assist),
      label: "Prestation PMR (accès restreint)",
      href: "",
    });
  const pn = e.level_crossing;
  if (pn)
    out.push({
      kind: "pn",
      id: pn.id,
      label: `PN ${str(pn.number)} · ${str(pn.line)}`,
      href: `/operations/carte-pn?pn=${pn.id}`,
    });
  return out;
}

function entry(r: RecordModel, readers: Map<string, { id: string; name: string }[]>): LogEntry {
  const e = exp(r);
  const cat = str(r.category);
  return {
    id: r.id,
    body: str(r.body),
    category: (LOG_CATEGORIES as readonly string[]).includes(cat) ? (cat as LogCategory) : "info",
    occurredAt: str(r.occurred_at),
    urgent: !!r.urgent,
    pinnedUntil: str(r.pinned_until),
    district: str(r.district),
    train: str(r.train),
    links: links(r),
    attachments: Array.isArray(r.attachments) ? (r.attachments as string[]) : [],
    status: str(r.status) === "retiree" ? "retiree" : "active",
    retiredReason: str(r.retired_reason),
    authorId: str(r.author),
    authorName:
      str(r.source) === "irail"
        ? "iRail · SNCB"
        : str(e.author?.name) || str(e.author?.username) || "Agent",
    authorAvatar: str(r.source) === "irail" ? "" : str(e.author?.avatar),
    source: str(r.source) === "irail" ? "irail" : "agent",
    editedAt: str(r.edited_at),
    created: str(r.created),
    updated: str(r.updated),
    readers: readers.get(r.id) ?? [],
    replyTo: (() => {
      const p = e.reply_to as RecordModel | undefined;
      if (!str(r.reply_to)) return null;
      if (!p) return { id: str(r.reply_to), author: "", excerpt: "Message indisponible" };
      const pa = (p.expand as { author?: RecordModel } | undefined)?.author;
      return {
        id: p.id,
        author:
          str(p.source) === "irail"
            ? "iRail · SNCB"
            : str(pa?.name) || str(pa?.username) || "Agent",
        excerpt: plainText(str(p.body)).slice(0, 140),
      };
    })(),
    replyCount: 0,
    raw: {
      busOrder: str(r.bus_order),
      taxiOrder: str(r.taxi_order),
      pmrAssist: str(r.pmr_assist),
      levelCrossing: str(r.level_crossing),
    },
  };
}

const EXPAND = "author,bus_order,taxi_order,pmr_assist,level_crossing,reply_to,reply_to.author";

export const logListSchema = z.object({
  jour: z.string().refine(isValidDay).optional().catch(undefined),
  categorie: z.enum(LOG_CATEGORIES).optional().catch(undefined),
  q: z.string().trim().max(80).optional().catch(undefined),
  auteur: pbId.optional().catch(undefined),
  pn: pbId.optional().catch(undefined),
  urgentes: z
    .string()
    .optional()
    .transform((v) => v === "1"),
  /** Masquer les messages iRail. */
  agents: z
    .string()
    .optional()
    .transform((v) => v === "1"),
  /** Nombre de messages affichés (fil continu, « plus anciens » par 100). */
  n: z.coerce.number().int().min(100).max(1000).catch(100).default(100),
  retirees: z
    .string()
    .optional()
    .transform((v) => v === "1"),
});
export type LogFilters = z.input<typeof logListSchema>;

/** Réponses actives par message d'origine (un appel, borné à la page affichée). */
async function replyCounts(entryIds: string[]) {
  const map = new Map<string, number>();
  if (!entryIds.length) return map;
  const pb = await pbForRequest();
  try {
    // Par paquets de 50 (longueur d'URL, profondeur d'expression SQLite).
    for (let i = 0; i < entryIds.length; i += 50) {
      const chunk = entryIds.slice(i, i + 50);
      const rows = await pb.collection("ops_log").getFullList({
        filter: `status = "active" && (${chunk.map((id, j) => pb.filter(`reply_to = {:r${j}}`, { [`r${j}`]: id })).join(" || ")})`,
        fields: "reply_to",
        batch: 500,
      });
      for (const r of rows) map.set(str(r.reply_to), (map.get(str(r.reply_to)) ?? 0) + 1);
    }
  } catch {
    // Champ absent (base pas encore migrée) : pas de compteur.
  }
  return map;
}

/** Réponses d'un message (panneau de détail), de la plus ancienne à la plus récente. */
export async function listReplies(id: string): Promise<LogEntry[]> {
  const pb = await pbForRequest();
  const items = await pb.collection("ops_log").getFullList({
    filter: pb.filter('reply_to = {:id} && status = "active"', { id: pbId.parse(id) }),
    sort: "created",
    expand: EXPAND,
  });
  return items.map((r) => entry(r, new Map()));
}

async function readersOf(entryIds: string[]) {
  const map = new Map<string, { id: string; name: string }[]>();
  if (entryIds.length === 0) return map;
  const pb = await pbForRequest();
  // Par paquets de 50 (longueur du filtre).
  for (let i = 0; i < entryIds.length; i += 50) {
    const chunk = entryIds.slice(i, i + 50);
    const params: Record<string, string> = {};
    const filter = chunk.map((id, k) => ((params[`e${k}`] = id), `entry = {:e${k}}`)).join(" || ");
    const items = await pb
      .collection("ops_log_reads")
      .getFullList({ filter: pb.filter(filter, params), expand: "user", sort: "created" });
    for (const it of items) {
      const list = map.get(str(it.entry)) ?? [];
      const u = exp(it).user;
      list.push({ id: str(it.user), name: str(u?.name) || str(u?.username) || "Agent" });
      map.set(str(it.entry), list);
    }
  }
  return map;
}

/** Fil continu (décision du 9 oct. 2026 : pas de sélection par jour) : les `n` derniers messages par heure d'envoi, ou
 * les résultats d'une recherche sur 180 jours. */
export async function listLog(input: LogFilters, ctx: { coordinator: boolean }) {
  const f = logListSchema.parse(input);
  const pb = await pbForRequest();
  const parts: string[] = [];
  const since = toPbInstant(brusselsToUtc(addDays(brusselsDay(), -180)));
  // Recherche plein texte : chaque mot doit figurer dans le texte, le nom de l'auteur ou le n° de train.
  if (f.q) {
    const words = f.q.split(/\s+/).filter(Boolean).slice(0, 6);
    parts.push(pb.filter("occurred_at >= {:a}", { a: since }));
    words.forEach((w) =>
      parts.push(
        pb.filter("(body ~ {:w} || author.name ~ {:w} || author.username ~ {:w} || train ~ {:w})", {
          w,
        }),
      ),
    );
  } else if (f.pn)
    parts.push(pb.filter("occurred_at >= {:a} && level_crossing = {:p}", { a: since, p: f.pn }));
  if (f.categorie) parts.push(pb.filter("category = {:c}", { c: f.categorie }));
  if (f.auteur) parts.push(pb.filter("author = {:u}", { u: f.auteur }));
  if (f.urgentes) parts.push("urgent = true");
  if (f.agents) parts.push('source != "irail"');
  if (!(f.retirees && ctx.coordinator)) parts.push('status = "active"');
  const res = await pb.collection("ops_log").getList(1, f.n, {
    filter: parts.join(" && "),
    sort: "-created,-id",
    expand: EXPAND,
  });
  const ids = res.items.map((r) => r.id);
  const [readers, counts] = await Promise.all([readersOf(ids), replyCounts(ids)]);
  return {
    rows: res.items.map((r) => ({ ...entry(r, readers), replyCount: counts.get(r.id) ?? 0 })),
    total: res.totalItems,
    limit: f.n,
    hasMore: res.totalItems > res.items.length,
    search: !!f.q || !!f.pn,
  };
}

/** Consignes épinglées en cours (toutes dates). */
export async function listPinned(): Promise<LogEntry[]> {
  const pb = await pbForRequest();
  const items = await pb.collection("ops_log").getFullList({
    filter: pb.filter('status = "active" && pinned_until > {:now}', {
      now: toPbInstant(new Date().toISOString()),
    }),
    sort: "pinned_until",
    expand: EXPAND,
  });
  const readers = await readersOf(items.map((r) => r.id));
  return items.map((r) => entry(r, readers));
}

/** Dernières entrées (widget du tableau de bord). */
export async function latestLog(limit = 5): Promise<LogEntry[]> {
  const pb = await pbForRequest();
  const res = await pb.collection("ops_log").getList(1, limit, {
    filter: 'status = "active"',
    sort: "-occurred_at",
    expand: EXPAND,
  });
  return res.items.map((r) => entry(r, new Map()));
}

export async function getLogEntry(id: string): Promise<LogEntry> {
  const pb = await pbForRequest();
  const r = await pb.collection("ops_log").getOne(pbId.parse(id), { expand: EXPAND });
  const readers = await readersOf([r.id]);
  return entry(r, readers);
}

export type LogEvent = {
  id: string;
  kind: string;
  field: string;
  from: string;
  to: string;
  by: string;
  note: string;
  at: string;
};

export async function listLogEvents(id: string): Promise<LogEvent[]> {
  const pb = await pbForRequest();
  const items = await pb.collection("ops_log_events").getFullList({
    filter: pb.filter("entry = {:e}", { e: pbId.parse(id) }),
    sort: "at",
    expand: "by",
  });
  return items.map((e) => ({
    id: e.id,
    kind: str(e.kind),
    field: str(e.field),
    from: str(e.from),
    to: str(e.to),
    by: str(exp(e).by?.name) || "Système",
    note: str(e.note),
    at: str(e.at),
  }));
}

export type Agent = { id: string; name: string; username: string };

/** Agents mentionnables (actifs, hors otto_agent). */
export async function listMentionable(): Promise<Agent[]> {
  const pb = await pbForRequest();
  const items = await pb.collection("users").getFullList({
    filter: 'role != "disabled" && role != "otto_agent" && username != ""',
    sort: "name",
    fields: "id,name,username",
  });
  return items.map((u) => ({
    id: u.id,
    name: str(u.name) || str(u.username),
    username: str(u.username),
  }));
}

export type Linkable = { kind: LinkedObject["kind"]; id: string; label: string };

/** Objets à lier à une entrée (recherche courte, droits de l'agent). */
export async function searchLinkables(kind: LinkedObject["kind"], q: string): Promise<Linkable[]> {
  const pb = await pbForRequest();
  const term = q.trim().slice(0, 40);
  const n = /^\d{1,7}$/.test(term) ? Number(term) : 0;
  try {
    if (kind === "bus") {
      const res = await pb.collection("bus_orders").getList(1, 8, {
        filter: term
          ? pb.filter("(number = {:n} || origin ~ {:q} || destination ~ {:q})", { n, q: term })
          : "",
        sort: "-order_date,-number",
        fields: "id,number,origin,destination",
      });
      return res.items.map((b) => ({
        kind,
        id: b.id,
        label: `Bus C3 n° ${num(b.number)} · ${str(b.origin)} → ${str(b.destination)}`,
      }));
    }
    if (kind === "taxi") {
      const res = await pb.collection("taxi_orders").getList(1, 8, {
        filter: term
          ? pb.filter("(number = {:n} || from_station ~ {:q} || to_station ~ {:q})", { n, q: term })
          : "",
        sort: "-trip_at",
        fields: "id,number,from_station,to_station",
      });
      return res.items.map((t) => ({
        kind,
        id: t.id,
        label: `Taxi n° ${num(t.number)} · ${str(t.from_station)} → ${str(t.to_station)}`,
      }));
    }
    if (kind === "pmr") {
      const today = brusselsDay();
      const res = await pb.collection("pmr_assists").getList(1, 8, {
        filter: pb.filter(
          "day >= {:a} && day <= {:b}" + (term ? " && (station ~ {:q} || train ~ {:q})" : ""),
          {
            a: addDays(today, -1),
            b: addDays(today, 1),
            q: term,
          },
        ),
        sort: "day,time",
        fields: "id,day,time,station,train",
      });
      return res.items.map((a) => ({
        kind,
        id: a.id,
        label: `Prestation ${str(a.day).slice(5)} ${str(a.time) || "--:--"} · ${str(a.station)}${str(a.train) ? ` · ${str(a.train)}` : ""}`,
      }));
    }
    const res = await pb.collection("level_crossings").getList(1, 8, {
      filter: term
        ? pb.filter("(number ~ {:q} || line ~ {:q} || address ~ {:q})", { q: term })
        : "",
      sort: "line,number",
      fields: "id,line,number,address",
    });
    return res.items.map((p) => ({
      kind,
      id: p.id,
      label: `PN ${str(p.number)} · ${str(p.line)}${str(p.address) ? ` · ${str(p.address).slice(0, 40)}` : ""}`,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------------------------------
// Notifications

export type Notification = {
  id: string;
  kind: "mention" | "urgent" | "train" | "systeme" | "perturbation";
  title: string;
  body: string;
  link: string;
  readAt: string;
  created: string;
};

export async function listNotifications(
  limit = 30,
): Promise<{ items: Notification[]; unread: number }> {
  const pb = await pbForRequest();
  const [res, unread] = await Promise.all([
    pb.collection("notifications").getList(1, limit, { sort: "-created" }),
    pb.collection("notifications").getList(1, 1, { filter: 'read_at = ""', fields: "id" }),
  ]);
  return {
    items: res.items.map((n) => ({
      id: n.id,
      kind: (["mention", "urgent", "train", "systeme", "perturbation"].includes(str(n.kind))
        ? str(n.kind)
        : "systeme") as Notification["kind"],
      title: str(n.title),
      body: str(n.body),
      // Lien interne seulement (règle PocketBase + contrôle ici).
      link: /^\/(?!\/)/.test(str(n.link)) ? str(n.link) : "",
      readAt: str(n.read_at),
      created: str(n.created),
    })),
    unread: unread.totalItems,
  };
}

// ---------------------------------------------------------------------------------------------------
// Passages à niveau

export type LevelCrossing = {
  id: string;
  line: string;
  number: string;
  bk: number;
  address: string;
  lat: number;
  lon: number;
  zone: string;
  notes: string;
  source: string;
  updated: string;
};

export type Depot = { code: string; label: string; lat: number; lon: number };

function crossing(r: RecordModel): LevelCrossing {
  return {
    id: r.id,
    line: str(r.line),
    number: str(r.number),
    bk: num(r.bk),
    address: str(r.address),
    lat: num(r.lat),
    lon: num(r.lon),
    zone: str(r.zone),
    notes: str(r.notes),
    source: str(r.source),
    updated: str(r.updated),
  };
}

/** Tri naturel ligne puis numéro (« 9 bis » après « 9 », « 12 » après « 9 »). */
export function compareCrossings(a: LevelCrossing, b: LevelCrossing) {
  const la = parseInt(a.line.slice(2), 10) - parseInt(b.line.slice(2), 10);
  if (la) return la;
  if (a.line !== b.line) return a.line.localeCompare(b.line);
  const na = parseInt(a.number, 10) - parseInt(b.number, 10);
  return na || a.number.localeCompare(b.number);
}

export async function listCrossings(): Promise<LevelCrossing[]> {
  const pb = await pbForRequest();
  const items = await pb
    .collection("level_crossings")
    .getFullList({ filter: "active = true", batch: 1000 });
  return items.map(crossing).sort(compareCrossings);
}

export async function listDepots(): Promise<Depot[]> {
  const pb = await pbForRequest();
  const items = await pb.collection("pmr_zones").getFullList({ sort: "code" });
  return items.map((z) => ({
    code: str(z.code),
    label: str(z.depot_label) || str(z.label),
    lat: num(z.depot_lat),
    lon: num(z.depot_lon),
  }));
}

// ---------------------------------------------------------------------------------------------------
// Trains suivis et gares favorites

export type Watch = {
  id: string;
  train: string;
  day: string;
  label: string;
  threshold: number;
  delay: number | null;
  cancelled: boolean;
};

export async function listWatches(userId: string): Promise<Watch[]> {
  const pb = await pbForRequest();
  const items = await pb.collection("train_watches").getFullList({
    filter: pb.filter("user = {:u} && day >= {:d}", { u: userId, d: brusselsDay() }),
    sort: "day,created",
  });
  return items.map((w) => {
    const s = (w.last_state ?? {}) as { delay?: number; cancelled?: boolean };
    return {
      id: w.id,
      train: str(w.train),
      day: str(w.day),
      label: str(w.label),
      threshold: num(w.threshold_min) || 5,
      delay: typeof s.delay === "number" ? s.delay : null,
      cancelled: !!s.cancelled,
    };
  });
}

export function favoritesOf(preferences: unknown): FavoriteStation[] {
  return parseFavorites(preferences);
}

/** Gares des lignes du district (filtre des perturbations iRail). */
export async function districtStations(district: string): Promise<string[]> {
  if (!district) return [];
  const pb = await pbForRequest();
  const items = await pb
    .collection("line_stations")
    .getFullList({ filter: pb.filter("district = {:d}", { d: district }), fields: "station" })
    .catch(() => []);
  return [...new Set(items.map((s) => str(s.station)).filter(Boolean))];
}
