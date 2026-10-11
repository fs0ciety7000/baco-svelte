import "server-only";

import { busFilename, taxiFilename } from "@/lib/orders/mail";
import { env } from "@/server/env";
import {
  busReference,
  getBusOrder,
  getTaxiOrder,
  orderAgent,
  redactPmr,
} from "@/server/data/orders";
import { busOrderPdf, taxiOrderPdf } from "@/server/pdf/order-pdf";

// Archives des bons (demande du 11 oct. 2026) : à la clôture d'un bon (statut « terminé »), son PDF est produit ici
// avec le jeton de l'agent, puis rangé par PocketBase (route interne `/api/csm/archives/store` : volume + copie R2).
// Le PDF d'un taxi est archivé SANS les données PMR nominatives : l'archive est gardée sans limite de durée, alors que
// le nominatif PMR est anonymisé après 12 mois (note DPO).

export function archivesEnabled(): boolean {
  return env.CSM_INTERNAL_SECRET.length >= 32;
}

type Archived = { ok: true; id: string; r2: boolean } | { ok: false; error: string };

/** Produit et range le PDF d'un bon terminé. Ne lève pas : un échec n'empêche jamais la clôture. */
export async function archiveOrder(
  kind: "bus" | "taxi",
  id: string,
  userId: string,
): Promise<Archived> {
  if (!archivesEnabled()) return { ok: false, error: "Archives non configurées (secret interne)." };
  try {
    let pdf: Uint8Array;
    let filename: string;
    let reference: string;
    let route: string;
    let day: string;
    let district: string;
    if (kind === "bus") {
      const [order, ref] = await Promise.all([getBusOrder(id), busReference()]);
      if (order.meta.status !== "termine") return { ok: false, error: "Bon non terminé." };
      pdf = await busOrderPdf(order, { agentName: orderAgent(order.meta), drivers: ref.drivers });
      filename = busFilename(order.draft);
      reference = order.draft.relation.trim() || `Bon bus n° ${order.meta.number}`;
      route = `${order.draft.origin} → ${order.draft.destination}`;
      day = order.draft.order_date;
      district = order.draft.district;
    } else {
      const order = redactPmr(await getTaxiOrder(id));
      if (order.meta.status !== "termine") return { ok: false, error: "Bon non terminé." };
      pdf = await taxiOrderPdf(order, { agentName: orderAgent(order.meta) });
      filename = taxiFilename(order.draft);
      reference = `Taxi n° ${order.meta.number}`;
      route = `${order.draft.from_station} → ${order.draft.to_station}`;
      day = order.draft.trip_day;
      district = order.draft.district;
    }
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("order_id", id);
    fd.set("reference", reference.slice(0, 120));
    fd.set("route", route.slice(0, 300));
    fd.set("service_day", /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "");
    fd.set("district", district ?? "");
    fd.set("generated_by", userId);
    fd.set(
      "file",
      new File([pdf as Uint8Array<ArrayBuffer>], filename.replace(/[^\w.→ -]+/g, "_"), {
        type: "application/pdf",
      }),
    );
    const res = await fetch(`${env.PB_URL.replace(/\/$/, "")}/api/csm/archives/store`, {
      method: "POST",
      headers: { "x-csm-internal": env.CSM_INTERNAL_SECRET },
      body: fd,
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      r2?: boolean;
      message?: string;
    };
    if (!res.ok || !body.id) return { ok: false, error: body.message ?? `HTTP ${res.status}` };
    return { ok: true, id: body.id, r2: !!body.r2 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue." };
  }
}

/** Sauvegarde zip des PDF (mois périmés ou un mois donné), par la route interne de PocketBase. */
export async function backupArchives(
  month?: string,
): Promise<{ months: { month: string; count: number }[]; r2: boolean }> {
  const res = await fetch(`${env.PB_URL.replace(/\/$/, "")}/api/csm/archives/backup`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csm-internal": env.CSM_INTERNAL_SECRET },
    body: JSON.stringify(month ? { month } : {}),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Sauvegarde refusée (HTTP ${res.status}).`);
  return (await res.json()) as { months: { month: string; count: number }[]; r2: boolean };
}
