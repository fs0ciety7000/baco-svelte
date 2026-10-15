import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FilterBar, OrderList, type ListFilters } from "@/components/orders/order-list";
import { Button } from "@/components/ui/button";
import { ListStatus } from "@/components/ui/list-toolbar";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { resolveBusPeriod, defaultBusPeriod } from "@/lib/orders/period";
import { brusselsDay } from "@/lib/orders/time";
import { listOrders } from "@/server/data/orders";

import { LiveRefresh } from "./live-refresh";

export const metadata: Metadata = { title: "Commandes bus · CSM" };

export default async function CommandesBusPage({
  searchParams,
}: {
  searchParams: Promise<ListFilters>;
}) {
  const user = await requirePermission("otto:read");
  const sp = await searchParams;
  // Période par défaut J-1 → J+6 quand l'URL ne donne aucune borne (11 oct. 2026) ; `?du=&au=` = toutes les dates.
  // Recherche ou statut demandés (liens « à envoyer », « en cours », n° de bon) : toutes les dates, sinon un bon
  // ancien n'était plus trouvé (relecture du 11 oct. 2026). Les champs de date affichent la semaine par défaut et sont
  // renvoyés avec la recherche : la semaine par défaut est alors ignorée, une autre période est respectée.
  const today = brusselsDay();
  const week = defaultBusPeriod(today);
  const searching = !!(sp.q || sp.statut);
  const resolved = resolveBusPeriod(sp, today);
  const period =
    searching && (resolved.isDefault || (sp.du === week.du && sp.au === week.au))
      ? { du: "", au: "", isDefault: false }
      : resolved;
  // Champs de date = période réellement appliquée (vides avec une recherche : toutes les dates).
  const filters: ListFilters = { ...sp, du: period.du, au: period.au };
  const { rows, total } = await listOrders(
    {
      kind: "bus",
      q: filters.q,
      status: filters.statut,
      from: period.du || undefined,
      to: period.au || undefined,
      district: filters.district,
    },
    { userId: user.id, canBus: true, canTaxi: false },
  );
  return (
    <section className="flex flex-col gap-4" aria-label="Commandes bus">
      <FilterBar
        action="/commandes"
        filters={filters}
        defaultPeriod={defaultBusPeriod(brusselsDay())}
        actions={
          can(user, "otto:write") ? (
            <Button asChild variant="primary">
              <Link href="/commandes/nouveau" data-shortcut="new" aria-keyshortcuts="n">
                <Plus aria-hidden /> Nouveau bon
              </Link>
            </Button>
          ) : null
        }
      />
      <ListStatus
        count={
          <span data-testid="orders-count">
            <span className="font-medium text-fg tabular">{total}</span> commandes bus
          </span>
        }
        live={<LiveRefresh topics={["bus_orders"]} />}
      />
      <OrderList
        rows={rows}
        total={total}
        context={JSON.stringify(filters)}
        emptyText="Aucune commande bus pour ces filtres."
      />
    </section>
  );
}
