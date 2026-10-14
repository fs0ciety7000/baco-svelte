"use server";

import type PocketBase from "pocketbase";
import { unstable_rethrow } from "next/navigation";

import { lineLabel } from "@/lib/lines";
import { plainText } from "@/lib/ops/chat-markdown";
import { isArchivedOrder } from "@/lib/orders/archive";
import { addDays, brusselsDay, formatDay, isValidDay, pbDate } from "@/lib/orders/time";
import { routeWithVias, viaList } from "@/lib/orders/via";
import { can, isAdmin, type PermissionSubject } from "@/lib/permissions";
import {
  orderPaletteGroups,
  paletteHeading,
  parsePaletteQuery,
  rankStations,
  uniqueBy,
  type PaletteGroupId,
  type PaletteQuery,
} from "@/lib/search/palette";
import { foldStation } from "@/lib/stations/search";
import { pl } from "@/lib/utils";
import { visibleModules } from "@/navigation";
import { requireUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";
import { allow } from "@/server/rate-limit";
import { resolveStationTerms, stationFilter } from "@/server/stations";

export type SearchHit = {
  kind: PaletteGroupId;
  label: string;
  meta: string;
  href: string;
};

export type SearchGroup = {
  id: PaletteGroupId;
  heading: string;
  items: SearchHit[];
  /** « Voir tout » : la recherche de la page du module, quand le groupe est plein. */
  more?: string;
};

/** Résultats par groupe (5 au plus : la palette reste lisible ; « Voir tout » mène à la page du module). */
const LIMIT = 5;

const str = (v: unknown) => (typeof v === "string" ? v : "");
const enc = encodeURIComponent;
const join = (...parts: unknown[]) =>
  parts
    .map((p) => (typeof p === "number" ? String(p) : str(p)))
    .filter(Boolean)
    .join(" · ");

/** Onglet de navigation autorisé (mêmes règles que `requireRoute`) : écrans sans droit propre (Gares, Équipe…). */
function routeOk(user: PermissionSubject, href: string): boolean {
  return visibleModules(user).some((m) => m.tabs.some((t) => t.href === href));
}

type Ctx = {
  pb: PocketBase;
  p: PaletteQuery;
  q: string;
  terms: string[];
};

function group(id: PaletteGroupId, items: SearchHit[], more?: string): SearchGroup {
  return {
    id,
    heading: paletteHeading(id),
    items: items.slice(0, LIMIT),
    more: more && items.length >= LIMIT ? more : undefined,
  };
}

/**
 * Recherche dans les données depuis la palette ⌘K (audit UX du 9 oct. 2026, étendue à tous les modules le 14 oct.).
 * Avec le jeton de l'agent : les règles PocketBase et ses droits s'appliquent ; chaque groupe n'est interrogé que si
 * l'agent voit l'écran correspondant (compte Écran : rien ; invité : bons bus et taxi). 5 résultats par groupe, requêtes
 * bornées (`perPage`, `fields`), filtres liés (`pb.filter`) ; un groupe en erreur est simplement omis.
 */
export async function paletteSearch(input: string): Promise<SearchGroup[]> {
  try {
    const user = await requireUser();
    const p = parsePaletteQuery(input);
    if (!p) return [];
    // Appelée à la frappe (après 250 ms) : 120 recherches par minute et par agent au plus.
    if (!allow(`palette:${user.id}`, 120, 60_000)) return [];
    const pb = await pbForRequest();
    const q = p.q;
    // Gares : recherche tolérante (accents, casse, abréviation PtCar → nom), 6 noms candidats au plus. Inutile pour une
    // relation ou une ligne explicite.
    const terms = p.relation || p.lineOnly || !p.text ? [] : await resolveStationTerms(q, 6);
    const ctx: Ctx = { pb, p, q, terms };
    const tasks: Promise<SearchGroup | null>[] = [];
    const add = (ok: boolean, run: () => Promise<SearchGroup | null>) => {
      if (ok) tasks.push(run());
    };
    const nameSearch = p.text && !p.relation && !p.lineOnly;

    // --- Opérations -------------------------------------------------------------------------------------------
    add(!!p.trainNumber && can(user, "live:read"), async () =>
      group("live", [
        {
          kind: "live",
          label: `Train ${p.trainNumber}`,
          meta: "Trains en direct",
          href: `/operations?train=${p.trainNumber}`,
        },
      ]),
    );
    add(can(user, "journal:read"), () => journal(ctx));
    add(can(user, "carte_pn:read") && !p.relation, () => crossings(ctx));

    // --- Commandes --------------------------------------------------------------------------------------------
    add(can(user, "otto:read") && !p.lineOnly, () => busOrders(ctx));
    add(can(user, "generate_taxi:read") && !p.lineOnly, () => taxiOrders(ctx));
    add(nameSearch && routeOk(user, "/commandes/fournisseurs"), () =>
      suppliers(ctx, can(user, "generate_taxi:read")),
    );
    add(can(user, "archives:read") && !p.lineOnly, () => archives(ctx));

    // --- PMR (aucun nom de voyageur, même avec pmr:read) ------------------------------------------------------
    const range = pb.filter("day >= {:a} && day <= {:b}", {
      a: addDays(brusselsDay(), -30),
      b: addDays(brusselsDay(), 30),
    });
    add(can(user, "deplacements:read") && !p.lineOnly, () => missions(ctx, range, "pmr"));
    add(can(user, "pmr:read") && !p.lineOnly, () => missions(ctx, range, "groups"));

    // --- Ressources -------------------------------------------------------------------------------------------
    const gares = routeOk(user, "/referentiels/gares");
    const journee = can(user, "journal:read");
    if (nameSearch && (gares || journee)) {
      const found = stations(ctx);
      add(gares, async () => {
        const rows = await found;
        return group(
          "stations",
          rows.map((s) => ({
            kind: "stations",
            label: s.name,
            meta: join(
              s.abbr,
              s.nameNl && s.nameNl !== s.name ? s.nameNl : "",
              s.district,
              s.lines.slice(0, 3).map(lineLabel).join(", "),
            ),
            href: `/referentiels/trains?vue=gare&gare=${enc(s.name)}`,
          })),
          `/referentiels/gares?q=${enc(q)}`,
        );
      });
      // Ma journée à la gare la plus probable (frise du jour filtrée sur la gare).
      add(journee, async () => {
        const best = (await found)[0];
        return best
          ? group("journee", [
              {
                kind: "journee",
                label: `Ma journée à ${best.name}`,
                meta: "Prises en charge, bons et taxis du jour",
                href: `/operations/journee?gare=${enc(best.name)}`,
              },
            ])
          : null;
      });
    }
    add(routeOk(user, "/referentiels/lignes") && (!!p.line || (nameSearch && q.length >= 3)), () =>
      lines(ctx),
    );
    const trains = routeOk(user, "/referentiels/trains");
    add(trains && (!!p.relation || (nameSearch && q.length >= 3)), () => relations(ctx));
    add(trains && !!p.trainNumber, () => trainServices(ctx));
    add(can(user, "ptcar:read") && nameSearch, () => ptcar(ctx));
    add(can(user, "repertoire:read") && !p.lineOnly && !p.relation, () => contacts(ctx));
    add(can(user, "documents:read") && nameSearch, () => procedures(ctx));
    add(can(user, "documents:read") && nameSearch, () => documents(ctx));
    add(can(user, "ebp:read") && (nameSearch || !!p.line), () => ebp(ctx));

    // --- Équipe et administration -----------------------------------------------------------------------------
    add(nameSearch && routeOk(user, "/equipe"), () => team(ctx));
    add(nameSearch && isAdmin(user), () => accounts(ctx));

    const settled = await Promise.allSettled(tasks);
    const groups = settled.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
    return orderPaletteGroups(p, groups);
  } catch (e) {
    unstable_rethrow(e);
    return [];
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Groupes

async function journal({ pb, q }: Ctx): Promise<SearchGroup> {
  // Messages actifs dont le texte contient la recherche, les plus récents d'abord (10 oct. 2026).
  const r = await pb.collection("ops_log").getList(1, LIMIT, {
    filter: pb.filter('status = "active" && (body ~ {:q} || train ~ {:q})', { q }),
    sort: "-created",
    expand: "author",
    fields: "id,body,created,source,expand.author.name",
    skipTotal: true,
  });
  return group(
    "journal",
    r.items.map((m) => {
      const at = pbDate(str(m.created));
      const author =
        m.source === "irail"
          ? "iRail"
          : str((m.expand as { author?: { name?: string } } | undefined)?.author?.name);
      return {
        kind: "journal",
        label: plainText(str(m.body)).replace(/\s+/g, " ").slice(0, 90) || "Message",
        meta: join(at ? formatDay(brusselsDay(at)) : "", author),
        href: `/operations/journal?entree=${m.id}`,
      };
    }),
    `/operations/journal?q=${enc(q)}`,
  );
}

async function crossings({ pb, p, q }: Ctx): Promise<SearchGroup | null> {
  const ors: string[] = [];
  if (p.line) ors.push(pb.filter("line = {:l}", { l: `L.${p.line}` }));
  if (!p.lineOnly && p.orderNumber && q.length <= 4)
    ors.push(pb.filter("(number = {:n} || number ~ {:nb})", { n: q, nb: `${q} ` }));
  if (!p.lineOnly && p.text) ors.push(pb.filter("address ~ {:q}", { q }));
  if (!ors.length) return null;
  const r = await pb.collection("level_crossings").getList(1, LIMIT, {
    filter: `active = true && (${ors.join(" || ")})`,
    sort: "line,number",
    fields: "id,line,number,address",
    skipTotal: true,
  });
  return group(
    "pn",
    r.items.map((c) => ({
      kind: "pn",
      label: `PN ${str(c.number)} · ${lineLabel(str(c.line))}`,
      meta: str(c.address).slice(0, 80),
      href: `/operations/carte-pn?pn=${c.id}`,
    })),
  );
}

/** Bon clôturé depuis plus de 30 jours : toujours trouvé par ⌘K, signalé « Archivé ». */
function archivedOf(o: Record<string, unknown>): boolean {
  return isArchivedOrder({
    status: str(o.status),
    sent_at: str(o.sent_at),
    cancelled_at: str(o.cancelled_at),
    ended_at: str(o.ended_at),
    updated: str(o.updated),
  });
}

async function busOrders({ pb, p, q, terms }: Ctx): Promise<SearchGroup> {
  // N° de bon, n° de train, relation (n° TC) ; gares de départ / d'arrivée (recherche tolérante).
  const ors = [stationFilter(pb, ["origin", "destination"], terms, { fields: ["relation"], q })];
  if (p.orderNumber) ors.push(pb.filter("number = {:n}", { n: p.orderNumber }));
  if (p.trainNumber) ors.push(pb.filter("train_number = {:t}", { t: q }));
  const r = await pb.collection("bus_orders").getList(1, LIMIT, {
    filter: ors.filter(Boolean).join(" || "),
    sort: "-order_date,-created",
    fields:
      "id,number,origin,destination,order_date,relation,train_number,status,sent_at,ended_at,cancelled_at,updated",
    skipTotal: true,
  });
  return group(
    "bus",
    r.items.map((o) => {
      const day = str(o.order_date).slice(0, 10);
      return {
        kind: "bus",
        label: `Bon ${o.number ?? ""} · ${str(o.origin) || "?"} → ${str(o.destination) || "?"}`,
        meta: join(
          isValidDay(day) ? formatDay(day) : "",
          o.relation,
          o.train_number ? `train ${str(o.train_number)}` : "",
          archivedOf(o) ? "Archivé" : "",
        ),
        href: `/commandes/bus/${o.id}`,
      };
    }),
    `/commandes?q=${enc(q)}`,
  );
}

async function taxiOrders({ pb, p, q, terms }: Ctx): Promise<SearchGroup> {
  // Jamais les champs PMR du taxi (nom du voyageur) : n°, train, relation, société, gares seulement.
  const ors = [
    stationFilter(pb, ["from_station", "to_station", "via_station"], terms, {
      fields: ["relation_number", "taxi_name"],
      q,
    }),
  ];
  if (p.orderNumber) ors.push(pb.filter("number = {:n}", { n: p.orderNumber }));
  if (p.trainNumber) ors.push(pb.filter("train_number = {:t}", { t: q }));
  const r = await pb.collection("taxi_orders").getList(1, LIMIT, {
    filter: ors.filter(Boolean).join(" || "),
    sort: "-trip_at,-number",
    fields:
      "id,number,from_station,to_station,via_station,via_stations,trip_at,taxi_name,train_number,status,sent_at,ended_at,cancelled_at,updated",
    skipTotal: true,
  });
  return group(
    "taxi",
    r.items.map((o) => {
      const at = pbDate(str(o.trip_at));
      return {
        kind: "taxi",
        label: `Taxi ${o.number ?? ""} · ${routeWithVias(str(o.from_station), viaList(o), str(o.to_station))}`,
        meta: join(
          at ? formatDay(brusselsDay(at)) : "",
          o.taxi_name,
          o.train_number ? `train ${str(o.train_number)}` : "",
          archivedOf(o) ? "Archivé" : "",
        ),
        href: `/commandes/taxi/${o.id}`,
      };
    }),
    `/commandes/taxi?q=${enc(q)}`,
  );
}

async function suppliers({ pb, q }: Ctx, taxi: boolean): Promise<SearchGroup> {
  const opts = { filter: pb.filter("name ~ {:q}", { q }), sort: "name", skipTotal: true };
  const [bus, taxis] = await Promise.all([
    pb
      .collection("bus_companies")
      .getList(1, LIMIT, { ...opts, fields: "id,name,phone" })
      .then((r) => r.items)
      .catch(() => []),
    taxi
      ? pb
          .collection("taxi_companies")
          .getList(1, LIMIT, { ...opts, fields: "id,name" })
          .then((r) => r.items)
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  // Bus et taxis à parts égales quand les deux en ont.
  const b = bus.slice(0, Math.max(LIMIT - Math.min(taxis.length, 2), 3));
  const t = taxis.slice(0, LIMIT - b.length);
  return group(
    "suppliers",
    [
      ...b.map((c) => ({
        kind: "suppliers" as const,
        label: str(c.name),
        meta: join("Société de bus", c.phone),
        href: `/commandes/fournisseurs?type=bus&q=${enc(str(c.name))}`,
      })),
      ...t.map((c) => ({
        kind: "suppliers" as const,
        label: str(c.name),
        meta: "Société de taxi",
        href: `/commandes/fournisseurs?type=taxi&q=${enc(str(c.name))}`,
      })),
    ],
    `/commandes/fournisseurs?q=${enc(q)}`,
  );
}

async function archives({ pb, q, terms }: Ctx): Promise<SearchGroup> {
  const r = await pb.collection("order_pdfs").getList(1, LIMIT, {
    filter: stationFilter(pb, ["route"], terms, { fields: ["reference", "route"], q }),
    sort: "-service_day,-created",
    fields: "id,kind,reference,route,service_day",
    skipTotal: true,
  });
  return group(
    "archives",
    r.items.map((a) => {
      const day = str(a.service_day);
      return {
        kind: "archives",
        label: str(a.reference) || "Bon archivé",
        meta: join(
          a.kind === "taxi" ? "Taxi" : "Bus",
          a.route,
          isValidDay(day) ? formatDay(day) : "",
        ),
        href: `/commandes/archives?q=${enc(str(a.reference) || q)}`,
      };
    }),
    `/commandes/archives?q=${enc(q)}`,
  );
}

async function missions(
  { pb, q, terms }: Ctx,
  range: string,
  kind: "pmr" | "groups",
): Promise<SearchGroup> {
  // N° de dossier, gare ou train ; aucun nom de voyageur ; 30 jours autour d'aujourd'hui.
  const filter = stationFilter(pb, ["station", "other_station"], terms, {
    fields: ["dicos_ref", "train"],
    q,
  });
  const r = await pb
    .collection(kind === "pmr" ? "pmr_assists" : "group_missions")
    .getList(1, LIMIT, {
      filter: `${range} && ${filter} && status != "annulee"`,
      sort: "-day,time",
      fields: "id,day,time,train,station,other_station,dicos_ref",
      skipTotal: true,
    });
  const base = kind === "pmr" ? "/pmr" : "/groupes";
  return group(
    kind,
    r.items.map((m) => {
      const day = str(m.day);
      return {
        kind,
        label: `${str(m.train) || "?"} · ${str(m.station) || "?"} → ${str(m.other_station) || "?"}`,
        meta: join(
          isValidDay(day) ? formatDay(day) : "",
          m.time,
          m.dicos_ref ? `dossier ${str(m.dicos_ref)}` : "",
        ),
        href: `${base}?district=tous&du=${day}&au=${day}&q=${enc(str(m.dicos_ref) || str(m.train) || q)}`,
      };
    }),
    `${base}?district=tous&q=${enc(q)}`,
  );
}

type StationHit = {
  abbr: string;
  name: string;
  nameNl: string;
  aliases: string[];
  district: string;
  lines: string[];
};

async function stations({ pb, p, q }: Ctx): Promise<StationHit[]> {
  // `search_key` = noms repliés « |mons|bergen|fms| » : début d'un nom (« |mon ») puis contenu ; rangés en JavaScript.
  const fq = foldStation(q);
  if (!fq) return [];
  const opts = {
    fields: "abbr,name,name_nl,aliases,district,lines",
    sort: "name",
    skipTotal: true,
  };
  const prefix = p.abbr
    ? pb.filter("(search_key ~ {:pre} || abbr = {:a})", { pre: `|${fq}`, a: p.abbr })
    : pb.filter("search_key ~ {:pre}", { pre: `|${fq}` });
  const [a, b] = await Promise.all([
    pb.collection("stations").getList(1, 10, { ...opts, filter: prefix }),
    pb
      .collection("stations")
      .getList(1, 15, { ...opts, filter: pb.filter("search_key ~ {:q}", { q: fq }) }),
  ]);
  const byName = new Map<string, StationHit>();
  for (const r of [...a.items, ...b.items])
    byName.set(str(r.name), {
      abbr: str(r.abbr),
      name: str(r.name),
      nameNl: str(r.name_nl),
      aliases: Array.isArray(r.aliases) ? r.aliases.map(String) : [],
      district: str(r.district),
      lines: Array.isArray(r.lines) ? r.lines.map(String) : [],
    });
  return rankStations([...byName.values()], q, LIMIT);
}

async function lines({ pb, p, q, terms }: Ctx): Promise<SearchGroup> {
  const ors: string[] = [];
  if (p.line) ors.push(pb.filter("(line = {:l} || line ~ {:l})", { l: p.line }));
  if (!p.lineOnly && p.text) {
    ors.push(pb.filter("name ~ {:q}", { q }));
    // Lignes qui desservent la gare cherchée (noms dans le JSON des gares).
    const st = stationFilter(pb, ["stations"], terms.slice(0, 3));
    if (st) ors.push(st);
  }
  const r = await pb.collection("rail_lines").getList(1, 20, {
    filter: ors.join(" || "),
    fields: "line,name,count",
    skipTotal: true,
  });
  const exact = p.line ?? "";
  const rows = r.items
    .map((l) => ({ line: str(l.line), name: str(l.name), count: Number(l.count) || 0 }))
    .sort(
      (x, y) =>
        Number(y.line === exact) - Number(x.line === exact) ||
        Number(y.line.startsWith(exact)) - Number(x.line.startsWith(exact)) ||
        x.line.localeCompare(y.line, "fr", { numeric: true }),
    );
  return group(
    "lines",
    rows.map((l) => ({
      kind: "lines",
      label: `${lineLabel(l.line)}${l.name ? ` · ${l.name}` : ""}`,
      meta: l.count ? `${l.count} ${pl(l.count, "gare")}` : "Ligne",
      href: `/referentiels/lignes?ligne=${enc(l.line)}`,
    })),
  );
}

async function relations({ pb, p, q, terms }: Ctx): Promise<SearchGroup> {
  const filter = p.relation
    ? // « S1 » : S1, S1-1, S1-2… mais pas S10.
      pb.filter("(relation = {:r} || relation ~ {:rd})", { r: p.relation, rd: `${p.relation}-` })
    : stationFilter(pb, ["label"], terms.slice(0, 4), { fields: ["relation", "label"], q });
  const r = await pb.collection("train_relations").getList(1, LIMIT, {
    filter,
    sort: "relation,key",
    fields: "key,relation,label,trains",
    skipTotal: true,
  });
  return group(
    "relations",
    r.items.map((x) => ({
      kind: "relations",
      label: `${str(x.relation)}${x.label ? ` · ${str(x.label)}` : ""}`,
      meta: x.trains ? `${Number(x.trains)} ${pl(Number(x.trains), "train")}` : "Relation",
      href: `/referentiels/trains?rel=${enc(str(x.key))}`,
    })),
    p.relation ? undefined : `/referentiels/trains?q=${enc(q)}`,
  );
}

async function trainServices({ pb, p }: Ctx): Promise<SearchGroup> {
  const r = await pb.collection("train_services").getList(1, 10, {
    filter: pb.filter("number = {:n}", { n: p.trainNumber }),
    sort: "-days",
    fields: "number,relation,origin,terminus,first_dep,last_arr",
    skipTotal: true,
  });
  return group(
    "trains",
    uniqueBy(r.items, (s) => Number(s.number)).map((s) => ({
      kind: "trains",
      label: `Train ${Number(s.number)} · ${str(s.origin) || "?"} → ${str(s.terminus) || "?"}`,
      meta: join(
        s.relation,
        s.first_dep && s.last_arr ? `${str(s.first_dep)} – ${str(s.last_arr)}` : "",
      ),
      href: `/referentiels/trains?train=${Number(s.number)}`,
    })),
  );
}

async function ptcar({ pb, q, terms }: Ctx): Promise<SearchGroup> {
  const r = await pb.collection("ptcar").getList(1, LIMIT, {
    filter: stationFilter(pb, ["name_fr", "name_nl"], terms, { fields: ["abbr"], q }),
    sort: "name_fr",
    fields: "abbr,name_fr",
    skipTotal: true,
  });
  return group(
    "ptcar",
    r.items.map((x) => ({
      kind: "ptcar",
      label: str(x.name_fr) || str(x.abbr),
      meta: `PtCar ${str(x.abbr)}`,
      href: `/referentiels/ptcar?q=${enc(str(x.abbr))}`,
    })),
    `/referentiels/ptcar?q=${enc(q)}`,
  );
}

async function contacts({ pb, q }: Ctx): Promise<SearchGroup> {
  const r = await pb.collection("directory_contacts").getList(1, LIMIT, {
    filter: pb.filter("(name ~ {:q} || phone ~ {:q} || group ~ {:q})", { q }),
    sort: "name",
    fields: "id,name,phone,group",
    skipTotal: true,
  });
  return group(
    "contacts",
    r.items.map((c) => ({
      kind: "contacts",
      label: str(c.name),
      meta: join(c.group, c.phone) || "Annuaire",
      // Fiche ouverte directement dans l'annuaire (panneau, refonte du 14 oct. 2026).
      href: `/referentiels?q=${enc(str(c.name) || q)}&id=${c.id}`,
    })),
    `/referentiels?q=${enc(q)}`,
  );
}

async function procedures({ pb, q }: Ctx): Promise<SearchGroup> {
  const r = await pb.collection("procedures").getList(1, LIMIT, {
    filter: pb.filter("(title ~ {:q} || category ~ {:q})", { q }),
    sort: "title",
    fields: "id,title,category",
    skipTotal: true,
  });
  return group(
    "procedures",
    r.items.map((x) => ({
      kind: "procedures",
      label: str(x.title) || "Procédure",
      meta: join("Procédure", x.category),
      href: `/referentiels/documents?q=${enc(str(x.title) || q)}`,
    })),
    `/referentiels/documents?q=${enc(q)}`,
  );
}

async function documents({ pb, q }: Ctx): Promise<SearchGroup> {
  const r = await pb.collection("documents").getList(1, LIMIT, {
    filter: pb.filter("(name ~ {:q} || category ~ {:q})", { q }),
    sort: "name",
    fields: "id,name,category",
    skipTotal: true,
  });
  return group(
    "documents",
    r.items.map((x) => ({
      kind: "documents",
      label: str(x.name) || "Document",
      meta: join("Document", x.category),
      href: `/referentiels/documents/voir/${x.id}`,
    })),
    `/referentiels/documents?vue=documents&q=${enc(q)}`,
  );
}

async function ebp({ pb, p, q, terms }: Ctx): Promise<SearchGroup> {
  const ors = [stationFilter(pb, ["ptcar"], terms, { fields: ["ptcar", "abbr", "ebp_view"], q })];
  if (p.line) ors.push(pb.filter("line ~ {:l}", { l: p.line }));
  const r = await pb.collection("ebp_views").getList(1, LIMIT, {
    filter: ors.filter(Boolean).join(" || "),
    sort: "ptcar,abbr",
    fields: "id,line,ptcar,abbr,ebp_view",
    skipTotal: true,
  });
  return group(
    "ebp",
    r.items.map((x) => ({
      kind: "ebp",
      label: `${str(x.ptcar) || "?"}${x.ebp_view ? ` · vue ${str(x.ebp_view)}` : ""}`,
      meta: join("EBP", x.abbr, x.line ? lineLabel(str(x.line)) : ""),
      href: `/referentiels/ebp?q=${enc(str(x.ptcar) || q)}`,
    })),
    `/referentiels/ebp?q=${enc(q)}`,
  );
}

async function team({ pb, q }: Ctx): Promise<SearchGroup> {
  // Mêmes champs que l'annuaire de l'équipe, sans le rôle ni les droits ni l'e-mail.
  const r = await pb.collection("users").getList(1, LIMIT, {
    filter: pb.filter(
      'role != "disabled" && role != "connector" && role != "screen" && (name ~ {:q} || username ~ {:q} || fonction ~ {:q})',
      { q },
    ),
    sort: "name,username",
    fields: "id,name,username,fonction,district",
    skipTotal: true,
  });
  return group(
    "team",
    r.items.map((u) => ({
      kind: "team",
      label: str(u.name) || str(u.username) || "Agent",
      meta: join(u.fonction, u.district) || "Équipe",
      href: `/equipe?q=${enc(str(u.name) || str(u.username) || q)}`,
    })),
    `/equipe?q=${enc(q)}`,
  );
}

async function accounts({ pb, q }: Ctx): Promise<SearchGroup> {
  // Administration (admin / sysop) : fiche du compte. Jamais de filtre sur `email` (champ masqué, refusé).
  const r = await pb.collection("users").getList(1, LIMIT, {
    filter: pb.filter('role != "connector" && (name ~ {:q} || username ~ {:q})', { q }),
    sort: "name,username",
    fields: "id,name,username,role",
    skipTotal: true,
  });
  return group(
    "users",
    r.items.map((u) => ({
      kind: "users",
      label: str(u.name) || str(u.username) || "Compte",
      meta: join(u.username, u.role === "disabled" ? "désactivé" : ""),
      href: `/admin/utilisateurs/${u.id}`,
    })),
    `/admin?q=${enc(q)}`,
  );
}
