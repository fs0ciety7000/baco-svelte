import type { Metadata } from "next";
import type { RecordModel } from "pocketbase";

import { DirectoryServicesAdmin } from "@/components/admin/referentiels/directory-services-admin";
import { requirePermission } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";

export const metadata: Metadata = { title: "Services de l'annuaire · Référentiels · CSM" };

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Administration › Référentiels › Services de l'annuaire (annuaire v2, 5 nov. 2026) : services de Ressources › Contacts
 * (libellé, ordre, fonctions proposées dans le formulaire d'un contact). Un service utilisé ne se supprime pas.
 */
export default async function Page() {
  await requirePermission("referentiels:manage");
  const pb = await pbForRequest();
  const [services, contacts] = await Promise.all([
    pb
      .collection("directory_services")
      .getFullList({ sort: "sort,label", batch: 200 })
      .catch(() => [] as RecordModel[]),
    pb
      .collection("directory_contacts")
      .getFullList({ fields: "service", batch: 1000 })
      .catch(() => [] as RecordModel[]),
  ]);
  const used = new Map<string, number>();
  for (const c of contacts) used.set(str(c.service), (used.get(str(c.service)) ?? 0) + 1);
  return (
    <DirectoryServicesAdmin
      services={services.map((r) => ({
        id: r.id,
        key: str(r.key),
        label: str(r.label),
        sort: typeof r.sort === "number" ? r.sort : 0,
        functions: Array.isArray(r.functions)
          ? r.functions.filter((f): f is string => typeof f === "string")
          : [],
        used: used.get(str(r.key)) ?? 0,
      }))}
      unclassified={used.get("") ?? 0}
    />
  );
}
