import "server-only";

import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { z } from "zod";

import { resolveStationTerms, stationFilter } from "../stations";
import { pbForRequest } from "./orders";
import { timetableState } from "./timetable";

// Administration › Référentiels (navigation v3, 14 oct. 2026) : tableau de bord qualité et listes de gestion des
// référentiels du réseau. Lectures avec le jeton de l'agent (règles PocketBase) ; les pages exigent
// `referentiels:manage`. Les écritures passent par `app/(app)/admin/referentiels/actions.ts`.

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : 0);
const PER_PAGE = 25;

async function count(pb: PocketBase, collection: string, filter = ""): Promise<number | null> {
  try {
    const r = await pb.collection(collection).getList(1, 1, { filter, fields: "id" });
    return r.totalItems;
  } catch {
    return null;
  }
}

async function lastChange(
  pb: PocketBase,
  collection: string,
): Promise<{ at: string; by: string } | null> {
  try {
    const r = await pb.collection(collection).getList(1, 1, {
      sort: "-updated",
      expand: "updated_by",
      fields: "updated,expand.updated_by.name",
    });
    const it = r.items[0];
    if (!it) return null;
    const by = (it.expand as { updated_by?: RecordModel } | undefined)?.updated_by;
    return { at: str(it.updated), by: str(by?.name) };
  } catch {
    return null;
  }
}

export type QualityIssue = { label: string; count: number | null; href: string };
export type QualityCard = {
  id: "gares" | "lignes" | "ptcar" | "ebp" | "spi" | "pn" | "imports";
  title: string;
  href: string;
  total: number | null;
  noun: string;
  issues: QualityIssue[];
  last: { at: string; by: string } | null;
  note?: string;
};

// Filtres des anomalies : une seule définition, partagée par le tableau de bord et les listes.
export const PTCAR_ISSUES = {
  "sans-fr": { label: "Sans nom français", filter: 'name_fr = ""' },
  "sans-nl": { label: "Sans nom néerlandais", filter: 'name_nl = ""' },
} as const;
export const EBP_ISSUES = {
  incompletes: {
    label: "Incomplètes (ligne, abréviation ou vue)",
    filter: '(line = "" || abbr = "" || ebp_view = "")',
  },
  "sans-vue": { label: "Sans vue EBP", filter: 'ebp_view = ""' },
} as const;
export const SPI_ISSUES = {
  "sans-zone": { label: "Sans zone", filter: 'zone = ""' },
  "sans-lieu": { label: "Sans lieu ni adresse", filter: '(place = "" && address = "")' },
} as const;
export const PN_ISSUES = {
  "sans-coordonnees": {
    label: "Sans coordonnées (absents de la carte)",
    filter: "active = true && (lat = 0 || lon = 0)",
  },
  "sans-zone": { label: "Sans zone", filter: 'active = true && zone = ""' },
  "sans-adresse": { label: "Sans adresse", filter: 'active = true && address = ""' },
  desactives: { label: "Désactivés", filter: "active = false" },
} as const;
export const LINE_ISSUES = {
  manuelles: {
    label: "Modifiées ou créées à la main (à revoir après un import)",
    filter: "manual = true",
  },
  "sans-km": { label: "Sans sens ni kilométrage (non orientées)", filter: "oriented = false" },
} as const;

type IssueMap = Record<string, { label: string; filter: string }>;
function issuesOf(pb: PocketBase, collection: string, base: string, map: IssueMap) {
  return Promise.all(
    Object.entries(map).map(async ([k, v]) => ({
      label: v.label,
      count: await count(pb, collection, v.filter),
      href: `${base}?anomalie=${k}`,
    })),
  );
}

/** Tableau de bord : une carte par référentiel (fiches, anomalies, dernière modification, dernier import). */
export async function referentialQuality(): Promise<QualityCard[]> {
  const pb = await pbForRequest();
  const B = "/admin/referentiels";
  const [
    stations,
    noDistrict,
    proposals,
    lines,
    ptcar,
    ebp,
    spi,
    pn,
    lineIssues,
    ptcarIssues,
    ebpIssues,
    spiIssues,
    pnIssues,
    last,
    tt,
  ] = await Promise.all([
    count(pb, "stations"),
    count(pb, "stations", 'district = "" && country = "BE"'),
    count(pb, "stations", 'district = "" && district_suggested != ""'),
    count(pb, "rail_lines"),
    count(pb, "ptcar"),
    count(pb, "ebp_views"),
    count(pb, "spi_points"),
    count(pb, "level_crossings"),
    issuesOf(pb, "rail_lines", `${B}/lignes`, LINE_ISSUES),
    issuesOf(pb, "ptcar", `${B}/ptcar`, PTCAR_ISSUES),
    issuesOf(pb, "ebp_views", `${B}/ebp`, EBP_ISSUES),
    issuesOf(pb, "spi_points", `${B}/spi`, SPI_ISSUES),
    issuesOf(pb, "level_crossings", `${B}/pn`, PN_ISSUES),
    Promise.all(
      ["stations", "rail_lines", "ptcar", "ebp_views", "spi_points", "level_crossings"].map((c) =>
        lastChange(pb, c),
      ),
    ),
    timetableState(),
  ]);
  const stale = tt?.lastOkAt && Date.now() - Date.parse(tt.lastOkAt) > 26 * 3600_000 ? 1 : 0;
  return [
    {
      id: "gares",
      title: "Gares et districts",
      href: `${B}/gares`,
      total: stations,
      noun: "gare",
      issues: [
        {
          label: "Belges sans district",
          count: noDistrict,
          href: `${B}/gares?district=aucun&pays=be`,
        },
        {
          label: "Propositions de district à valider",
          count: proposals,
          href: `${B}/gares?proposition=oui`,
        },
      ],
      last: last[0] ?? null,
    },
    {
      id: "lignes",
      title: "Lignes",
      href: `${B}/lignes`,
      total: lines,
      noun: "ligne",
      issues: lineIssues,
      last: last[1] ?? null,
    },
    {
      id: "ptcar",
      title: "PtCar",
      href: `${B}/ptcar`,
      total: ptcar,
      noun: "PtCar",
      issues: ptcarIssues,
      last: last[2] ?? null,
    },
    {
      id: "ebp",
      title: "EBP",
      href: `${B}/ebp`,
      total: ebp,
      noun: "correspondance",
      issues: ebpIssues,
      last: last[3] ?? null,
    },
    {
      id: "spi",
      title: "Points SPI",
      href: `${B}/spi`,
      total: spi,
      noun: "point",
      issues: spiIssues,
      last: last[4] ?? null,
    },
    {
      id: "pn",
      title: "Passages à niveau",
      href: `${B}/pn`,
      total: pn,
      noun: "PN",
      issues: pnIssues,
      last: last[5] ?? null,
      note: "Droits de la Carte PN (ajout, modification, suppression) inchangés.",
    },
    {
      id: "imports",
      title: "Imports",
      href: `${B}/imports`,
      total: null,
      noun: "",
      issues: [
        {
          label: tt?.state === "error" ? "Dernière mise à jour en échec" : "Import de plus de 26 h",
          count: tt?.state === "error" ? 1 : stale,
          href: `${B}/imports`,
        },
      ],
      last: tt?.lastOkAt ? { at: tt.lastOkAt, by: "Import quotidien" } : null,
    },
  ];
}

// ---------------------------------------------------------------------------------------------------
// Listes de gestion (recherche + anomalie + page)

export const adminListSchema = z.object({
  q: z.string().trim().max(60).default(""),
  page: z.coerce.number().int().min(1).max(500).default(1),
  anomalie: z.string().max(30).default(""),
});
type ListInput = z.input<typeof adminListSchema>;

function pickIssue(map: IssueMap, key: string): string {
  return map[key]?.filter ?? "";
}

function paged<T>(res: { totalItems: number; page: number; totalPages: number }, rows: T[]) {
  return { rows, total: res.totalItems, page: res.page, totalPages: res.totalPages };
}

export type AdminPtcar = {
  id: string;
  updated: string;
  abbr: string;
  name_fr: string;
  name_nl: string;
};

export async function adminPtcar(input: ListInput) {
  const p = adminListSchema.parse(input);
  const pb = await pbForRequest();
  const parts = [pickIssue(PTCAR_ISSUES, p.anomalie)].filter(Boolean);
  if (p.q)
    parts.push(
      stationFilter(pb, ["name_fr", "name_nl"], await resolveStationTerms(p.q), {
        fields: ["abbr"],
        q: p.q,
      }),
    );
  const res = await pb
    .collection("ptcar")
    .getList(p.page, PER_PAGE, { filter: parts.map((x) => `(${x})`).join(" && "), sort: "abbr" });
  return paged(
    res,
    res.items.map((r): AdminPtcar => ({
      id: r.id,
      updated: str(r.updated),
      abbr: str(r.abbr),
      name_fr: str(r.name_fr),
      name_nl: str(r.name_nl),
    })),
  );
}

export type AdminEbp = {
  id: string;
  updated: string;
  line: string;
  ptcar: string;
  abbr: string;
  ebp_view: string;
};

export async function adminEbp(input: ListInput) {
  const p = adminListSchema.parse(input);
  const pb = await pbForRequest();
  const parts = [pickIssue(EBP_ISSUES, p.anomalie)].filter(Boolean);
  if (p.q)
    parts.push(
      pb.filter("line ~ {:q} || ptcar ~ {:q} || abbr ~ {:q} || ebp_view ~ {:q}", { q: p.q }),
    );
  const res = await pb.collection("ebp_views").getList(p.page, PER_PAGE, {
    filter: parts.map((x) => `(${x})`).join(" && "),
    sort: "ptcar,abbr",
  });
  return paged(
    res,
    res.items.map((r): AdminEbp => ({
      id: r.id,
      updated: str(r.updated),
      line: str(r.line),
      ptcar: str(r.ptcar),
      abbr: str(r.abbr),
      ebp_view: str(r.ebp_view),
    })),
  );
}

export type AdminSpi = {
  id: string;
  updated: string;
  line: string;
  place: string;
  zone: string;
  address: string;
  notes: string;
};

export async function adminSpi(input: ListInput) {
  const p = adminListSchema.parse(input);
  const pb = await pbForRequest();
  const parts = [pickIssue(SPI_ISSUES, p.anomalie)].filter(Boolean);
  if (p.q)
    parts.push(
      pb.filter("line ~ {:q} || place ~ {:q} || zone ~ {:q} || address ~ {:q}", { q: p.q }),
    );
  const res = await pb.collection("spi_points").getList(p.page, PER_PAGE, {
    filter: parts.map((x) => `(${x})`).join(" && "),
    sort: "line,place",
  });
  return paged(
    res,
    res.items.map((r): AdminSpi => ({
      id: r.id,
      updated: str(r.updated),
      line: str(r.line),
      place: str(r.place),
      zone: str(r.zone),
      address: str(r.address),
      notes: str(r.notes),
    })),
  );
}

export type AdminCrossing = {
  id: string;
  updated: string;
  line: string;
  number: string;
  bk: number;
  address: string;
  lat: number;
  lon: number;
  zone: string;
  notes: string;
  active: boolean;
};

export async function adminCrossings(input: ListInput) {
  const p = adminListSchema.parse(input);
  const pb = await pbForRequest();
  const parts = [pickIssue(PN_ISSUES, p.anomalie)].filter(Boolean);
  if (p.q)
    parts.push(
      pb.filter("line ~ {:q} || number ~ {:q} || address ~ {:q} || zone ~ {:q}", { q: p.q }),
    );
  const res = await pb.collection("level_crossings").getList(p.page, PER_PAGE, {
    filter: parts.map((x) => `(${x})`).join(" && "),
    sort: "line,number",
  });
  return paged(
    res,
    res.items.map((r): AdminCrossing => ({
      id: r.id,
      updated: str(r.updated),
      line: str(r.line),
      number: str(r.number),
      bk: num(r.bk),
      address: str(r.address),
      lat: num(r.lat),
      lon: num(r.lon),
      zone: str(r.zone),
      notes: str(r.notes),
      active: r.active === true,
    })),
  );
}

export type AdminLine = {
  id: string;
  line: string;
  name: string;
  count: number;
  manual: boolean;
  oriented: boolean;
  updated: string;
};

export async function adminLines(input: ListInput) {
  const p = adminListSchema.parse(input);
  const pb = await pbForRequest();
  const parts = [pickIssue(LINE_ISSUES, p.anomalie)].filter(Boolean);
  if (p.q) parts.push(pb.filter("line ~ {:q} || name ~ {:q}", { q: p.q.replace(/^L\.?\s*/i, "") }));
  const items = await pb.collection("rail_lines").getFullList({
    filter: parts.map((x) => `(${x})`).join(" && "),
    fields: "id,line,name,count,manual,oriented,updated",
    batch: 500,
  });
  const rows = items
    .map((r): AdminLine => ({
      id: r.id,
      line: str(r.line),
      name: str(r.name),
      count: num(r.count),
      manual: r.manual === true,
      oriented: r.oriented === true,
      updated: str(r.updated),
    }))
    .sort((a, b) => {
      const na = parseInt(a.line, 10);
      const nb = parseInt(b.line, 10);
      return (
        (Number.isNaN(na) ? 9999 : na) - (Number.isNaN(nb) ? 9999 : nb) ||
        a.line.localeCompare(b.line)
      );
    });
  return { rows, total: rows.length };
}
