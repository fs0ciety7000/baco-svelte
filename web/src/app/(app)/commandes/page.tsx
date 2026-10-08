import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FilterBar, OrderList, type ListFilters } from "@/components/orders/order-list";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { listOrders } from "@/server/data/orders";

import { LiveRefresh } from "./live-refresh";

export const metadata: Metadata = { title: "Commandes bus · CSM" };

export default async function CommandesBusPage({
  searchParams,
}: {
  searchParams: Promise<ListFilters>;
}) {
  const user = await requirePermission("otto:read");
  const filters = await searchParams;
  const { rows, total } = await listOrders(
    {
      kind: "bus",
      q: filters.q,
      status: filters.statut,
      from: filters.du,
      to: filters.au,
      district: filters.district,
    },
    { userId: user.id, canBus: true, canTaxi: false },
  );
  return (
    <section className="flex flex-col gap-4" aria-label="Commandes bus">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body text-fg-muted" data-testid="orders-count">
          <span className="font-mono text-fg tabular">{total}</span> commandes bus
        </p>
        <div className="flex items-center gap-3">
          <LiveRefresh topics={["bus_orders"]} />
          {can(user, "otto:write") ? (
            <Button asChild variant="primary">
              <Link href="/commandes/nouveau">
                <Plus aria-hidden /> Nouveau bon
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      <FilterBar action="/commandes" filters={filters} />
      <OrderList rows={rows} total={total} emptyText="Aucune commande bus pour ces filtres." />
    </section>
  );
}
