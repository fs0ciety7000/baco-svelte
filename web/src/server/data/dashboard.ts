import "server-only";

import { createPb } from "../pocketbase";
import { readSessionToken } from "../session";

import { listBusOrders } from "./bus-orders";

// Données du tableau de bord (avec le jeton de l'agent : les règles PocketBase s'appliquent).

/** Bornes UTC de la journée en cours à Bruxelles (corrige le bug v1 : date calculée en UTC). */
export function brusselsDayBounds(now = new Date()): { start: string; end: string; day: string } {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(now);
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const fmt = (d: string) => `${d} 00:00:00.000Z`;
  return { day, start: fmt(day), end: fmt(next.toISOString().slice(0, 10)) };
}

export async function dashboardStats() {
  const pb = createPb(await readSessionToken());
  const { start, end } = brusselsDayBounds();
  const count = async (filter: string, params: Record<string, string> = {}) =>
    (
      await pb
        .collection("bus_orders")
        .getList(1, 1, { filter: pb.filter(filter, params), fields: "id" })
    ).totalItems;
  const [active, toConfirm, today, running] = await Promise.all([
    count('status != "termine" && status != "annule"'),
    count('status = "envoye"'),
    count("order_date >= {:start} && order_date < {:end}", { start, end }),
    count('status = "en_cours"'),
  ]);
  const pending = await listBusOrders({ status: "envoye" });
  return { active, toConfirm, today, running, pending: pending.items.slice(0, 5) };
}

export type DashboardStats = Awaited<ReturnType<typeof dashboardStats>>;
