import type { Metadata } from "next";

import { listBusOrders, ORDER_STATUSES } from "@/server/data/bus-orders";

import { LiveRefresh } from "./live-refresh";

export const metadata: Metadata = { title: "Commandes · CSM" };

const STATUS_LABEL: Record<(typeof ORDER_STATUSES)[number], string> = {
  brouillon: "Brouillon",
  envoye: "Envoyé",
  confirme: "Confirmé",
  en_cours: "En cours",
  termine: "Terminé",
  facture: "Facturé",
  annule: "Annulé",
};

const dateFormat = new Intl.DateTimeFormat("fr-BE", {
  dateStyle: "medium",
  timeZone: "Europe/Brussels",
});

export default async function CommandesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; statut?: string }>;
}) {
  const { page, statut } = await searchParams;
  const status = ORDER_STATUSES.find((s) => s === statut);
  const orders = await listBusOrders({ page, status });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-mono text-xs tracking-widest text-neutral-500 uppercase">
            Commandes · {orders.totalItems} bus
          </p>
          <h1 className="text-2xl font-bold">Commandes bus</h1>
        </div>
        <LiveRefresh topics={["bus_orders"]} />
      </div>
      <ul className="flex flex-col divide-y border" data-testid="bus-orders">
        {orders.items.map((o) => (
          <li
            key={o.id}
            className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-center sm:gap-4"
          >
            <span className="font-mono text-sm tabular-nums">
              {o.order_date ? dateFormat.format(new Date(o.order_date)) : "—"}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {o.origin || "?"} → {o.destination || "?"}
              {o.relation ? <span className="text-neutral-500"> · {o.relation}</span> : null}
            </span>
            <span className="font-mono text-xs uppercase">{STATUS_LABEL[o.status]}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-neutral-500">
        Page {orders.page} sur {orders.totalPages}
      </p>
    </main>
  );
}
