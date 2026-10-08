import "server-only";

import type { RecordModel } from "pocketbase";
import { z } from "zod";

import { pbForRequest } from "./orders";

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
// Lignes (line_stations + level_crossings + spi_points)

export type LineRef = { line: string; district: string; stations: number };

/** Lignes distinctes (depuis line_stations), avec district et nombre de gares. Tri naturel (L.1 < L.10). */
export async function listLines(): Promise<LineRef[]> {
  const pb = await pbForRequest();
  const items = await pb
    .collection("line_stations")
    .getFullList({ fields: "line,district", batch: 1000 });
  // District par ligne = district MAJORITAIRE de ses gares (une ligne à cheval sur deux districts ne disparaît pas
  // du filtre de l'autre selon l'ordre de lecture).
  const by = new Map<string, { stations: number; districts: Record<string, number> }>();
  for (const i of items) {
    const line = str(i.line);
    if (!line) continue;
    const cur = by.get(line) ?? { stations: 0, districts: {} };
    cur.stations += 1;
    const d = str(i.district);
    if (d) cur.districts[d] = (cur.districts[d] ?? 0) + 1;
    by.set(line, cur);
  }
  return [...by.entries()]
    .map(([line, v]) => ({
      line,
      stations: v.stations,
      district: Object.entries(v.districts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
    }))
    .sort((a, b) => a.line.localeCompare(b.line, "fr", { numeric: true }));
}

export type LineDetail = {
  line: string;
  district: string;
  stations: { id: string; station: string; position: number; hasOrder: boolean }[];
  crossings: { id: string; number: string; bk: number; address: string; zone: string }[];
  spi: { id: string; place: string; zone: string; address: string; notes: string }[];
};

export async function getLineDetail(line: string): Promise<LineDetail | null> {
  const pb = await pbForRequest();
  const l = z.string().trim().min(1).max(50).parse(line);
  const [stations, crossings, spi] = await Promise.all([
    pb.collection("line_stations").getFullList({
      filter: pb.filter("line = {:l}", { l }),
      sort: "position,station",
      batch: 1000,
    }),
    pb
      .collection("level_crossings")
      .getFullList({ filter: pb.filter("line = {:l}", { l }), sort: "number", batch: 1000 })
      .catch(() => []),
    pb
      .collection("spi_points")
      .getFullList({ filter: pb.filter("line = {:l}", { l }), sort: "place", batch: 1000 })
      .catch(() => []),
  ]);
  if (!stations.length && !crossings.length && !spi.length) return null;
  const district = stations.map((s) => str(s.district)).find(Boolean) ?? "";
  return {
    line: l,
    district,
    stations: stations.map((s) => ({
      id: s.id,
      station: str(s.station),
      position: num(s.position),
      hasOrder: num(s.position) > 0,
    })),
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
  const filter = p.q
    ? pb.filter("(abbr ~ {:q} || name_fr ~ {:q} || name_nl ~ {:q})", { q: p.q })
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
    sort: "ebp_view,abbr",
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
