import "server-only";

import type { RecordModel } from "pocketbase";
import { z } from "zod";

import { archiveReference } from "@/lib/orders/order-ref";

import { pbForRequest } from "./orders";

// Archives des bons (11 oct. 2026) : lecture avec le jeton de l'agent (règles `archives:read`).

export type ArchivedOrder = {
  id: string;
  kind: "bus" | "taxi";
  orderId: string;
  reference: string;
  route: string;
  day: string;
  district: string;
  by: string;
  created: string;
  r2: boolean;
  r2Error: string;
};

export type ArchiveBackup = {
  id: string;
  month: string;
  count: number;
  updated: string;
  r2: boolean;
  r2Error: string;
};

const str = (v: unknown) => (typeof v === "string" ? v : "");

function archived(r: RecordModel): ArchivedOrder {
  const by = (r.expand as Record<string, RecordModel | undefined> | undefined)?.generated_by;
  return {
    id: r.id,
    kind: r.kind === "taxi" ? "taxi" : "bus",
    orderId: str(r.order_id),
    reference: str(r.reference),
    route: str(r.route),
    day: str(r.service_day),
    district: str(r.district),
    by: str(by?.name) || str(by?.username),
    created: str(r.created),
    r2: !!str(r.r2_at),
    r2Error: str(r.r2_error),
  };
}

export const archiveListSchema = z.object({
  type: z.enum(["bus", "taxi"]).optional().catch(undefined),
  mois: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .catch(undefined),
  q: z.string().trim().max(60).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).catch(1),
});

export async function listArchives(input: Record<string, string | undefined>) {
  const p = archiveListSchema.parse(input);
  const pb = await pbForRequest();
  const parts: string[] = [];
  if (p.type) parts.push(pb.filter("kind = {:k}", { k: p.type }));
  if (p.mois) parts.push(pb.filter("service_day ~ {:m}", { m: `${p.mois}-` }));
  if (p.q) parts.push(pb.filter("(reference ~ {:q} || route ~ {:q})", { q: p.q }));
  const res = await pb.collection("order_pdfs").getList(p.page, 50, {
    filter: parts.join(" && "),
    sort: "-service_day,-created",
    expand: "generated_by",
    fields:
      "id,kind,order_id,reference,route,service_day,district,created,r2_at,r2_error,expand.generated_by.name,expand.generated_by.username",
  });
  const rows = res.items.map(archived);
  // N° de commande des bons (4 nov. 2026) : affiché à la place du n° séquentiel des archives anciennes.
  const refs = await orderRefs(
    pb,
    rows.map((r) => [r.kind, r.orderId] as const),
  );
  for (const r of rows)
    r.reference = archiveReference(r.reference, r.kind, refs.get(`${r.kind}-${r.orderId}`));
  return {
    rows,
    page: res.page,
    totalPages: res.totalPages,
    total: res.totalItems,
  };
}

export async function listArchiveBackups(): Promise<ArchiveBackup[]> {
  const pb = await pbForRequest();
  const rows = await pb.collection("order_pdf_backups").getFullList({
    sort: "-month",
    fields: "id,month,count,updated,r2_at,r2_error",
  });
  return rows.map((r) => ({
    id: r.id,
    month: str(r.month),
    count: typeof r.count === "number" ? r.count : 0,
    updated: str(r.updated),
    r2: !!str(r.r2_at),
    r2Error: str(r.r2_error),
  }));
}

/** PDF archivé de chaque bon (`kind-orderId` → id de l'archive), pour la liste des bons archivés. */
export async function archivePdfIndex(): Promise<Record<string, string>> {
  const pb = await pbForRequest();
  const rows = await pb
    .collection("order_pdfs")
    .getFullList({ fields: "id,kind,order_id", batch: 1000 })
    .catch(() => []);
  return Object.fromEntries(rows.map((r) => [`${str(r.kind)}-${str(r.order_id)}`, r.id]));
}

/** Bons finalisés (envoyés) sans archive (rattrapage) : identifiants, au plus `limit`. */
export async function unarchivedOrders(limit: number) {
  const pb = await pbForRequest();
  const done = new Set(
    (await pb.collection("order_pdfs").getFullList({ fields: "kind,order_id" })).map(
      (r) => `${str(r.kind)}:${str(r.order_id)}`,
    ),
  );
  const out: { kind: "bus" | "taxi"; id: string }[] = [];
  let remaining = 0;
  for (const kind of ["bus", "taxi"] as const) {
    const rows = await pb
      .collection(kind === "bus" ? "bus_orders" : "taxi_orders")
      .getFullList({ filter: 'status = "envoye"', fields: "id", sort: "created" });
    for (const r of rows) {
      if (done.has(`${kind}:${r.id}`)) continue;
      if (out.length < limit) out.push({ kind, id: r.id });
      else remaining++;
    }
  }
  return { todo: out, remaining };
}

/** `kind-id` → n° de commande des bons cités (50 au plus par type, bons supprimés absents). */
async function orderRefs(
  pb: Awaited<ReturnType<typeof pbForRequest>>,
  items: readonly (readonly ["bus" | "taxi", string])[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    (["bus", "taxi"] as const).map(async (kind) => {
      const ids = [...new Set(items.filter(([k]) => k === kind).map(([, id]) => id))]
        .filter((id) => /^[a-z0-9]{15}$/.test(id))
        .slice(0, 60);
      if (!ids.length) return;
      const filter = ids.map((id) => pb.filter("id = {:id}", { id })).join(" || ");
      const rows = await pb
        .collection(kind === "bus" ? "bus_orders" : "taxi_orders")
        .getFullList({ filter, fields: "id,order_ref" })
        .catch(() => [] as RecordModel[]);
      for (const r of rows) if (str(r.order_ref)) out.set(`${kind}-${r.id}`, str(r.order_ref));
    }),
  );
  return out;
}
