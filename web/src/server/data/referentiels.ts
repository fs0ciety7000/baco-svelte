import "server-only";

import type { RecordModel } from "pocketbase";
import { z } from "zod";

import { foldStation, stationMatchesAny } from "@/lib/stations/search";
import { lineDistrict } from "@/lib/timetable/lines";

import { resolveStationTerms, stationFilter } from "../stations";
import { pbForRequest } from "./orders";
import { normLine } from "./timetable";

// Accès aux données Référentiels, avec le jeton de l'agent (règles PocketBase). Tout est lu côté serveur : le
// navigateur ne parle qu'au domaine CSM. Les écritures passent par des Server Actions (actions.ts).

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : 0);
const exp = (r: RecordModel) => (r.expand ?? {}) as Record<string, RecordModel | undefined>;

// ---------------------------------------------------------------------------------------------------
// Annuaire (directory_contacts)

export type Contact = {
  id: string;
  name: string;
  phone: string;
  email: string;
  category: string;
  zone: string;
  group: string;
  note: string;
  author: string;
  updated: string;
};

function contact(r: RecordModel): Contact {
  return {
    id: r.id,
    name: str(r.name),
    phone: str(r.phone),
    email: str(r.email),
    category: str(r.category),
    zone: str(r.zone),
    group: str(r.group),
    note: str(r.note),
    author: str(exp(r).updated_by?.name),
    updated: str(r.updated),
  };
}

export const contactListSchema = z.object({
  q: z.string().trim().max(60).default(""),
  category: z.string().trim().max(60).optional(),
  zone: z.string().trim().max(60).optional(),
  group: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(200).default(1),
});

export async function listContacts(input: z.input<typeof contactListSchema>) {
  const p = contactListSchema.parse(input);
  const pb = await pbForRequest();
  const parts: string[] = [];
  if (p.category) parts.push(pb.filter("category = {:c}", { c: p.category }));
  if (p.zone) parts.push(pb.filter("zone = {:z}", { z: p.zone }));
  if (p.group) parts.push(pb.filter("group = {:g}", { g: p.group }));
  if (p.q)
    parts.push(
      pb.filter("(name ~ {:q} || phone ~ {:q} || email ~ {:q} || group ~ {:q})", { q: p.q }),
    );
  // Annuaire borné (≈ 385 contacts) : une page large suffit à tout afficher groupé, sans pagination fantôme.
  const res = await pb.collection("directory_contacts").getList(p.page, 500, {
    filter: parts.join(" && "),
    sort: "group,name",
    expand: "updated_by",
  });
  return {
    rows: res.items.map(contact),
    total: res.totalItems,
    page: res.page,
    totalPages: res.totalPages,
  };
}

/** Valeurs distinctes pour les filtres (385 contacts : lecture complète, agrégée en mémoire). */
export async function contactFacets() {
  const pb = await pbForRequest();
  const items = await pb
    .collection("directory_contacts")
    .getFullList({ fields: "category,zone,group", batch: 1000 });
  const set = (k: "category" | "zone" | "group") =>
    [...new Set(items.map((i) => str(i[k])).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "fr"),
    );
  return { categories: set("category"), zones: set("zone"), groups: set("group") };
}

export async function getContact(id: string): Promise<Contact> {
  const pb = await pbForRequest();
  const cid = z
    .string()
    .regex(/^[a-z0-9]{15}$/)
    .parse(id);
  const r = await pb.collection("directory_contacts").getOne(cid, { expand: "updated_by" });
  return contact(r);
}

/** Contacts proches (même nom OU même téléphone) : détection de doublon avant création. */
export async function similarContacts(name: string, phone: string): Promise<Contact[]> {
  const pb = await pbForRequest();
  const digits = phone.replace(/\D/g, "");
  const ors: string[] = [];
  const params: Record<string, string> = {};
  if (name.trim()) {
    ors.push("name ~ {:n}");
    params.n = name.trim();
  }
  if (digits.length >= 6) {
    ors.push("phone ~ {:p}");
    params.p = digits;
  }
  if (!ors.length) return [];
  const res = await pb.collection("directory_contacts").getList(1, 5, {
    filter: pb.filter(`(${ors.join(" || ")})`, params),
    sort: "name",
  });
  return res.items.map(contact);
}

// ---------------------------------------------------------------------------------------------------
// Lignes (rail_lines du référentiel des trains + stations + level_crossings + spi_points)
//
// Depuis le 14 oct. 2026, l'onglet Lignes lit les lignes construites chaque matin par l'import du référentiel des trains
// (toutes les lignes vues chez Infrabel, gares dans l'ordre) et non plus la table BACO `line_stations` (36 lignes du sud),
// qui reste la source des itinéraires des bons bus et d'Admin › Lignes et arrêts. District d'une ligne = majorité des
// districts de ses gares (Ressources › Gares).

export type LineRef = {
  line: string;
  name: string;
  district: string;
  stations: number;
  branches: number;
  /** Gares de la ligne qui correspondent à la recherche de gare. */
  matches: string[];
};

type RailStation = { n: string; a?: string; km?: number; b?: number; g?: number };
type RailBranch = { b: number; from: string; to: string };

const railStations = (v: unknown): RailStation[] =>
  Array.isArray(v)
    ? v.filter((s): s is RailStation => !!s && typeof s === "object" && typeof s.n === "string")
    : [];

/** District de chaque gare (nom FR, NL, alias → district), lu dans `stations`. */
async function stationDistricts(
  pb: Awaited<ReturnType<typeof pbForRequest>>,
): Promise<(name: string) => string> {
  const items = await pb
    .collection("stations")
    .getFullList({ fields: "name,name_nl,aliases,district", batch: 1000 })
    .catch(() => []);
  const by = new Map<string, string>();
  for (const r of items) {
    const d = str(r.district);
    if (!d) continue;
    const names = [str(r.name), str(r.name_nl), ...(Array.isArray(r.aliases) ? r.aliases : [])];
    for (const n of names) {
      const k = foldStation(str(n));
      if (k && !by.has(k)) by.set(k, d);
    }
  }
  return (name) => by.get(foldStation(name)) ?? "";
}

/** Toutes les lignes, avec district majoritaire ; `gare` : seulement celles qui la desservent (recherche tolérante). */
export async function listLines(gare = ""): Promise<LineRef[]> {
  const pb = await pbForRequest();
  const q = gare.trim().slice(0, 60);
  const [items, districtOf, terms] = await Promise.all([
    pb
      .collection("rail_lines")
      .getFullList({ fields: "line,name,stations,branches", batch: 1000 })
      .catch(() => []),
    stationDistricts(pb),
    q ? resolveStationTerms(q) : Promise.resolve([] as string[]),
  ]);
  const abbr = q.toUpperCase();
  const rows: LineRef[] = [];
  for (const r of items) {
    const stations = railStations(r.stations);
    const matches = q
      ? stations
          .filter((s) => s.a === abbr || (terms.length > 0 && stationMatchesAny(s.n, terms)))
          .map((s) => s.n)
      : [];
    if (q && !matches.length) continue;
    rows.push({
      line: str(r.line),
      name: str(r.name),
      district: lineDistrict(
        stations.map((s) => s.n),
        districtOf,
      ).district,
      stations: stations.length,
      branches: Array.isArray(r.branches) ? r.branches.length : 0,
      matches: [...new Set(matches)],
    });
  }
  return rows.sort((a, b) => a.line.localeCompare(b.line, "fr", { numeric: true }));
}

export type LineDetail = {
  line: string;
  name: string;
  district: string;
  /** Sens donné par les points kilométriques Infrabel. */
  oriented: boolean;
  stations: {
    name: string;
    abbr: string;
    km: number | null;
    district: string;
    branch: number;
    /** Le tronc reprend ici après une section parcourue sous un autre n° de ligne. */
    gap: boolean;
  }[];
  branches: RailBranch[];
  crossings: { id: string; number: string; bk: number; address: string; zone: string }[];
  spi: { id: string; place: string; zone: string; address: string; notes: string }[];
};

/** « 96 », « L.96 » → libellés possibles d'une ligne dans les référentiels BACO (PN : « L.96 », SPI : libre). */
function lineVariants(line: string): string[] {
  return [...new Set([line, `L.${line}`, `L${line}`, `L ${line}`])];
}

export async function getLineDetail(raw: string): Promise<LineDetail | null> {
  const l = normLine(z.string().trim().min(1).max(50).parse(raw));
  if (!/^[0-9A-Z]{1,12}$/.test(l)) return null;
  const pb = await pbForRequest();
  const variants = lineVariants(l);
  const orLine = (field: string) =>
    pb.filter(
      `(${variants.map((_, i) => `${field} = {:v${i}}`).join(" || ")})`,
      Object.fromEntries(variants.map((v, i) => [`v${i}`, v])),
    );
  const [rec, districtOf, crossings, spi] = await Promise.all([
    pb
      .collection("rail_lines")
      .getFirstListItem(pb.filter("line = {:l}", { l }))
      .catch(() => null),
    stationDistricts(pb),
    pb
      .collection("level_crossings")
      .getFullList({ filter: orLine("line"), sort: "number", batch: 1000 })
      .catch(() => []),
    pb
      .collection("spi_points")
      .getFullList({ filter: orLine("line"), sort: "place", batch: 1000 })
      .catch(() => []),
  ]);
  const stations = rec ? railStations(rec.stations) : [];
  if (!rec && !crossings.length && !spi.length) return null;
  return {
    line: l,
    name: rec ? str(rec.name) : "",
    district: lineDistrict(
      stations.map((s) => s.n),
      districtOf,
    ).district,
    oriented: !!rec?.oriented,
    stations: stations.map((s) => ({
      name: s.n,
      abbr: s.a ?? "",
      km: typeof s.km === "number" ? s.km : null,
      district: districtOf(s.n),
      branch: typeof s.b === "number" ? s.b : 0,
      gap: !!s.g,
    })),
    branches: rec && Array.isArray(rec.branches) ? (rec.branches as RailBranch[]) : [],
    crossings: crossings.map((c) => ({
      id: c.id,
      number: str(c.number),
      bk: num(c.bk),
      address: str(c.address),
      zone: str(c.zone),
    })),
    spi: spi.map((s) => ({
      id: s.id,
      place: str(s.place),
      zone: str(s.zone),
      address: str(s.address),
      notes: str(s.notes),
    })),
  };
}

// ---------------------------------------------------------------------------------------------------
// PtCar (ptcar) et EBP (ebp_views) — gabarit commun

export const refTableSchema = z.object({
  q: z.string().trim().max(60).default(""),
  page: z.coerce.number().int().min(1).max(500).default(1),
  incomplete: z.coerce.boolean().optional(),
});

export type PtcarRow = { id: string; abbr: string; nameFr: string; nameNl: string };

export async function listPtcar(input: z.input<typeof refTableSchema>) {
  const p = refTableSchema.parse(input);
  const pb = await pbForRequest();
  // Nom tolérant (accents, casse) et abréviation : « liege » trouve « Liège », « FMS » trouve Mons.
  const filter = p.q
    ? stationFilter(pb, ["name_fr", "name_nl"], await resolveStationTerms(p.q), {
        fields: ["abbr"],
        q: p.q,
      })
    : "";
  const res = await pb.collection("ptcar").getList(p.page, 20, { filter, sort: "abbr" });
  return {
    rows: res.items.map((r): PtcarRow => ({
      id: r.id,
      abbr: str(r.abbr),
      nameFr: str(r.name_fr),
      nameNl: str(r.name_nl),
    })),
    total: res.totalItems,
    page: res.page,
    totalPages: res.totalPages,
  };
}

export type EbpRow = {
  id: string;
  line: string;
  ptcar: string;
  abbr: string;
  ebpView: string;
};

export async function listEbp(input: z.input<typeof refTableSchema>) {
  const p = refTableSchema.parse(input);
  const pb = await pbForRequest();
  const parts: string[] = [];
  if (p.q)
    parts.push(
      pb.filter("(line ~ {:q} || ptcar ~ {:q} || abbr ~ {:q} || ebp_view ~ {:q})", { q: p.q }),
    );
  // « Incomplètes » : au moins une correspondance vide (18 % de Lignes, 12 % d'Abbr).
  if (p.incomplete) parts.push('(line = "" || abbr = "" || ebp_view = "")');
  const res = await pb.collection("ebp_views").getList(p.page, 20, {
    filter: parts.join(" && "),
    // Par gare (toujours renseignée) : un tri par vue mettait les 19 fiches sans vue en tête de la première page.
    sort: "ptcar,abbr",
  });
  return {
    rows: res.items.map((r): EbpRow => ({
      id: r.id,
      line: str(r.line),
      ptcar: str(r.ptcar),
      abbr: str(r.abbr),
      ebpView: str(r.ebp_view),
    })),
    total: res.totalItems,
    page: res.page,
    totalPages: res.totalPages,
  };
}

// ---------------------------------------------------------------------------------------------------
// Procédures et documents

export type DocumentRow = {
  id: string;
  name: string;
  category: string;
  fileName: string;
  author: string;
  created: string;
};

function documentRow(r: RecordModel): DocumentRow {
  return {
    id: r.id,
    name: str(r.name),
    category: str(r.category),
    fileName: str(r.file),
    author: str(exp(r).uploaded_by?.name),
    created: str(r.created),
  };
}

export type Procedure = {
  id: string;
  title: string;
  category: string;
  content: string;
  attachments: DocumentRow[];
  author: string;
  updated: string;
};

function procedure(r: RecordModel): Procedure {
  const atts = ((r.expand as Record<string, RecordModel[] | undefined> | undefined)?.attachments ??
    []) as RecordModel[];
  return {
    id: r.id,
    title: str(r.title),
    category: str(r.category),
    content: str(r.content),
    attachments: atts.map(documentRow),
    author: str(exp(r).updated_by?.name),
    updated: str(r.updated),
  };
}

export async function listProcedures(input: { q?: string; category?: string }) {
  const q = z
    .string()
    .trim()
    .max(60)
    .default("")
    .parse(input.q ?? "");
  const category = z
    .string()
    .trim()
    .max(60)
    .optional()
    .parse(input.category || undefined);
  const pb = await pbForRequest();
  const parts: string[] = [];
  if (category) parts.push(pb.filter("category = {:c}", { c: category }));
  if (q) parts.push(pb.filter("(title ~ {:q} || content ~ {:q})", { q }));
  const items = await pb.collection("procedures").getFullList({
    filter: parts.join(" && "),
    sort: "title",
    expand: "attachments,updated_by",
    batch: 500,
  });
  return items.map(procedure);
}

export async function procedureCategories(): Promise<string[]> {
  const pb = await pbForRequest();
  const items = await pb.collection("procedures").getFullList({ fields: "category", batch: 500 });
  return [...new Set(items.map((i) => str(i.category)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
}

export type ProcedureVersion = {
  id: string;
  title: string;
  category: string;
  content: string;
  by: string;
  at: string;
};

export async function getProcedure(
  id: string,
): Promise<{ procedure: Procedure; versions: ProcedureVersion[] }> {
  const pb = await pbForRequest();
  const pid = z
    .string()
    .regex(/^[a-z0-9]{15}$/)
    .parse(id);
  const [r, versions] = await Promise.all([
    pb.collection("procedures").getOne(pid, { expand: "attachments,updated_by" }),
    pb.collection("procedure_versions").getFullList({
      filter: pb.filter("procedure = {:p}", { p: pid }),
      sort: "-at",
      expand: "by",
      batch: 200,
    }),
  ]);
  return {
    procedure: procedure(r),
    versions: versions.map((v) => ({
      id: v.id,
      title: str(v.title),
      category: str(v.category),
      content: str(v.content),
      by: str(exp(v).by?.name),
      at: str(v.at),
    })),
  };
}

/** Un document (visionneuse) : null s'il n'existe pas ou n'est pas lisible. */
export async function getDocument(id: string): Promise<DocumentRow | null> {
  if (!/^[a-z0-9]{15}$/.test(id)) return null;
  const pb = await pbForRequest();
  try {
    return documentRow(await pb.collection("documents").getOne(id, { expand: "uploaded_by" }));
  } catch {
    return null;
  }
}

export async function listDocuments(input: { q?: string; category?: string }) {
  const q = z
    .string()
    .trim()
    .max(60)
    .default("")
    .parse(input.q ?? "");
  const category = z
    .string()
    .trim()
    .max(60)
    .optional()
    .parse(input.category || undefined);
  const pb = await pbForRequest();
  const parts: string[] = [];
  if (category) parts.push(pb.filter("category = {:c}", { c: category }));
  if (q) parts.push(pb.filter("(name ~ {:q})", { q }));
  const items = await pb.collection("documents").getFullList({
    filter: parts.join(" && "),
    sort: "-created",
    expand: "uploaded_by",
    batch: 500,
  });
  return items.map(documentRow);
}

export async function documentCategories(): Promise<string[]> {
  const pb = await pbForRequest();
  const items = await pb.collection("documents").getFullList({ fields: "category", batch: 500 });
  return [...new Set(items.map((i) => str(i.category)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
}

/** Pour la liste de sélection de pièces jointes dans l'éditeur de procédure. */
export async function listDocumentOptions(): Promise<{ id: string; name: string }[]> {
  const pb = await pbForRequest();
  const items = await pb
    .collection("documents")
    .getFullList({ fields: "id,name", sort: "name", batch: 500 });
  return items.map((i) => ({ id: i.id, name: str(i.name) }));
}
