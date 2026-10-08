import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FilterBar, OrderList, type ListFilters } from "@/components/orders/order-list";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { listOrders } from "@/server/data/orders";

import { LiveRefresh } from "../live-refresh";

export const metadata: Metadata = { title: "Commandes taxi · CSM" };

export default async function Page({ searchParams }: { searchParams: Promise<ListFilters> }) {
  const user = await requirePermission("generate_taxi:read");
  const filters = await searchParams;
  const { rows, total } = await listOrders(
    {
      kind: "taxi",
      q: filters.q,
      status: filters.statut,
      from: filters.du,
      to: filters.au,
      district: filters.district,
    },
    { userId: user.id, canBus: false, canTaxi: true },
  );
  return (
    <section className="flex flex-col gap-4" aria-label="Commandes taxi">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body text-fg-muted" data-testid="orders-count">
          <span className="font-mono text-fg tabular">{total}</span> commandes taxi
        </p>
        <div className="flex items-center gap-3">
          <LiveRefresh topics={["taxi_orders"]} />
          {can(user, "generate_taxi:write") ? (
            <Button asChild variant="primary">
              <Link href="/commandes/taxi/nouveau">
                <Plus aria-hidden /> Nouveau taxi
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      <FilterBar action="/commandes/taxi" filters={filters} />
      <OrderList rows={rows} total={total} emptyText="Aucune commande taxi pour ces filtres." />
    </section>
  );
}
