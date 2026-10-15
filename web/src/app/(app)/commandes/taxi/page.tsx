import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FilterBar, OrderList, type ListFilters } from "@/components/orders/order-list";
import { Button } from "@/components/ui/button";
import { ListStatus } from "@/components/ui/list-toolbar";
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
    { userId: user.id, canBus: false, canTaxi: true, canPmr: can(user, "pmr:read") },
  );
  return (
    <section className="flex flex-col gap-4" aria-label="Commandes taxi">
      <FilterBar
        action="/commandes/taxi"
        filters={filters}
        actions={
          can(user, "generate_taxi:write") ? (
            <Button asChild variant="primary">
              <Link href="/commandes/taxi/nouveau" data-shortcut="new" aria-keyshortcuts="n">
                <Plus aria-hidden /> Nouveau taxi
              </Link>
            </Button>
          ) : null
        }
      />
      <ListStatus
        count={
          <span data-testid="orders-count">
            <span className="font-medium text-fg tabular">{total}</span> commandes taxi
          </span>
        }
        live={<LiveRefresh topics={["taxi_orders"]} />}
      />
      <OrderList
        rows={rows}
        total={total}
        context={JSON.stringify(filters)}
        emptyText="Aucune commande taxi pour ces filtres."
      />
    </section>
  );
}
