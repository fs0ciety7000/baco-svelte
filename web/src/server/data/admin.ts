import "server-only";

import type { RecordModel } from "pocketbase";
import { z } from "zod";

import { pbForRequest } from "./orders";

// Administration (admin et sysop seulement : `requireAdmin()` dans chaque page ; règles PocketBase en appui).
// Comptes, journal d'audit, lignes et arrêts, santé et mode maintenance (décisions du 9 oct. 2026).

const str = (v: unknown) => (typeof v === "string" ? v : "");
const arr = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

// ---------------------------------------------------------------------------------------------------
// Comptes

export type AdminUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  disabledRole: string;
  district: string;
  fonction: string;
  grants: string[];
  denies: string[];
  created: string;
  updated: string;
};

function adminUser(r: RecordModel): AdminUser {
  return {
    id: r.id,
    name: str(r.name),
    username: str(r.username),
    email: str(r.email),
    role: str(r.role),
    disabledRole: str(r.disabled_role),
    district: str(r.district),
    fonction: str(r.fonction),
    grants: arr(r.grants),
    denies: arr(r.denies),
    created: str(r.created),
    updated: str(r.updated),
  };
}

const USER_FIELDS =
  "id,name,username,email,role,disabled_role,district,fonction,grants,denies,created,updated";

export const userListSchema = z.object({
  q: z.string().trim().max(60).default(""),
  role: z.string().trim().max(20).optional(),
  district: z.string().trim().max(20).optional(),
});

export async function listUsers(input: z.input<typeof userListSchema>): Promise<AdminUser[]> {
  const p = userListSchema.parse(input);
  const pb = await pbForRequest();
  const parts: string[] = [];
  if (p.role) parts.push(pb.filter("role = {:r}", { r: p.role }));
  if (p.district) parts.push(pb.filter("district = {:d}", { d: p.district }));
  if (p.q)
    parts.push(
      pb.filter("(name ~ {:q} || username ~ {:q} || email ~ {:q} || fonction ~ {:q})", { q: p.q }),
    );
  const rows = await pb.collection("users").getFullList({
    filter: parts.join(" && "),
    sort: "name,username",
    fields: USER_FIELDS,
  });
  return rows.map(adminUser);
}

export async function getUser(id: string): Promise<AdminUser> {
  const pb = await pbForRequest();
  return adminUser(
    await pb.collection("users").getOne(
      z
        .string()
        .regex(/^[a-z0-9-]{15,36}$/)
        .parse(id),
      { fields: USER_FIELDS },
    ),
  );
}

// ---------------------------------------------------------------------------------------------------
// Journal d'audit (écrit par les hooks ; lecture admin ou droit `audit:read`)

export type AuditRow = {
  id: string;
  action: string;
  collection: string;
  record: string;
  user: string;
  userName: string;
  changes: unknown;
  legacy: boolean;
  at: string;
};

export const auditListSchema = z.object({
  collection: z
    .string()
    .trim()
    .max(100)
    .regex(/^[a-z_]*$/)
    .default(""),
  action: z.enum(["create", "update", "delete"]).optional().catch(undefined),
  user: z
    .string()
    .trim()
    .max(36)
    .regex(/^[a-z0-9-]*$/)
    .default(""),
  record: z
    .string()
    .trim()
    .max(100)
    .regex(/^[A-Za-z0-9_-]*$/)
    .default(""),
  du: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  au: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

export function auditFilter(
  pb: Awaited<ReturnType<typeof pbForRequest>>,
  p: z.infer<typeof auditListSchema>,
): string {
  const parts: string[] = [];
  if (p.collection) parts.push(pb.filter("collection = {:c}", { c: p.collection }));
  if (p.action) parts.push(pb.filter("action = {:a}", { a: p.action }));
  if (p.user) parts.push(pb.filter("user = {:u}", { u: p.user }));
  if (p.record) parts.push(pb.filter("record = {:r}", { r: p.record }));
  if (p.du) parts.push(pb.filter("at >= {:d}", { d: `${p.du} 00:00:00.000Z` }));
  if (p.au) parts.push(pb.filter("at <= {:d}", { d: `${p.au} 23:59:59.999Z` }));
  return parts.join(" && ");
}

export async function listAudit(input: z.input<typeof auditListSchema>) {
  const p = auditListSchema.parse(input);
  const pb = await pbForRequest();
  const res = await pb.collection("audit_log").getList(p.page, 50, {
    filter: auditFilter(pb, p),
    sort: "-at",
  });
  // Noms des auteurs (le champ `user` est un texte, pas une relation : comptes supprimés conservés).
  const ids = [...new Set(res.items.map((r) => str(r.user)).filter(Boolean))];
  const names = new Map<string, string>();
  if (ids.length) {
    const users = await pb.collection("users").getFullList({
      filter: ids.map((id) => pb.filter("id = {:id}", { id })).join(" || "),
      fields: "id,name,username",
    });
    for (const u of users) names.set(u.id, str(u.name) || str(u.username));
  }
  return {
    page: res.page,
    totalPages: res.totalPages,
    totalItems: res.totalItems,
    items: res.items.map((r): AuditRow => ({
      id: r.id,
      action: str(r.action),
      collection: str(r.collection),
      record: str(r.record),
      user: str(r.user),
      userName: names.get(str(r.user)) ?? "",
      changes: r.changes,
      legacy: !!r.legacy,
      at: str(r.at),
    })),
  };
}

// ---------------------------------------------------------------------------------------------------
// Lignes et arrêts (line_stations)

export type LineStation = {
  id: string;
  line: string;
  station: string;
  position: number;
  district: string;
};

export async function listLines(): Promise<
  { line: string; district: string; stations: LineStation[] }[]
> {
  const pb = await pbForRequest();
  const rows = await pb.collection("line_stations").getFullList({ sort: "line,position" });
  const map = new Map<string, LineStation[]>();
  for (const r of rows) {
    const s: LineStation = {
      id: r.id,
      line: str(r.line),
      station: str(r.station),
      position: typeof r.position === "number" ? r.position : 0,
      district: str(r.district),
    };
    map.set(s.line, [...(map.get(s.line) ?? []), s]);
  }
  const majority = (list: LineStation[]) => {
    const count = new Map<string, number>();
    for (const s of list) if (s.district) count.set(s.district, (count.get(s.district) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  };
  return [...map.entries()]
    .map(([line, stations]) => ({ line, district: majority(stations), stations }))
    .sort((a, b) => a.line.localeCompare(b.line, "fr", { numeric: true }));
}

// ---------------------------------------------------------------------------------------------------
// Réglages globaux et santé

export async function getSetting<T>(key: string): Promise<{ id: string; value: T } | null> {
  const pb = await pbForRequest();
  try {
    const r = await pb
      .collection("app_settings")
      .getFirstListItem(pb.filter("key = {:k}", { k: key }));
    return { id: r.id, value: r.value as T };
  } catch {
    return null;
  }
}

/** Volumes des 30 derniers jours par module (créations), pour l'écran Santé. */
export async function moduleVolumes(): Promise<{ label: string; count: number | null }[]> {
  const pb = await pbForRequest();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().replace("T", " ");
  const MODULES: [string, string][] = [
    ["Commandes bus", "bus_orders"],
    ["Commandes taxi", "taxi_orders"],
    ["Missions PMR", "pmr_assists"],
    ["Journal (main courante)", "ops_log"],
    ["Procédures", "procedures"],
    ["Documents", "documents"],
  ];
  return Promise.all(
    MODULES.map(async ([label, col]) => {
      try {
        const r = await pb
          .collection(col)
          .getList(1, 1, { filter: pb.filter("created >= {:s}", { s: since }), fields: "id" });
        return { label, count: r.totalItems };
      } catch {
        return { label, count: null };
      }
    }),
  );
}
