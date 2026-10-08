import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { StatusBadge, statusColor } from "@/components/ui/status-badge";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { requirePermission } from "@/server/auth";
import { listBusOrders, ORDER_STATUSES } from "@/server/data/bus-orders";

import { LiveRefresh } from "./live-refresh";

export const metadata: Metadata = { title: "Commandes bus · CSM" };

const dateFormat = new Intl.DateTimeFormat("fr-BE", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  timeZone: "Europe/Brussels",
});

export default async function CommandesBusPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; statut?: string }>;
}) {
  await requirePermission("otto:read");
  const { page, statut } = await searchParams;
  const status = ORDER_STATUSES.find((s) => s === statut);
  const orders = await listBusOrders({ page, status });
  const date = (d: string) => (d ? dateFormat.format(new Date(d)) : "—");
  const route = (o: { origin: string; destination: string }) =>
    `${o.origin || "?"} → ${o.destination || "?"}`;

  return (
    <section className="flex flex-col gap-3" aria-label="Commandes bus">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body text-fg-muted" data-testid="orders-count">
          <span className="font-mono text-fg tabular">{orders.totalItems}</span> commandes bus
        </p>
        <LiveRefresh topics={["bus_orders"]} />
      </div>

      {orders.items.length === 0 ? (
        <EmptyState title="Aucune commande" description="Aucune commande bus pour ce filtre." />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <Th>N°</Th>
                  <Th>Date</Th>
                  <Th>Appel</Th>
                  <Th>Trajet</Th>
                  <Th>Relation</Th>
                  <Th numeric>Bus</Th>
                  <Th>Statut</Th>
                </tr>
              </THead>
              <tbody data-testid="bus-orders">
                {orders.items.map((o) => (
                  <Tr key={o.id} statusColor={statusColor(o.status)}>
                    <Td className="font-mono text-fg-muted">{o.legacy_id ?? "—"}</Td>
                    <Td className="font-mono tabular">{date(o.order_date)}</Td>
                    <Td className="font-mono tabular">{o.call_time || "—"}</Td>
                    <Td className="max-w-80 truncate">{route(o)}</Td>
                    <Td className="max-w-48 truncate text-fg-muted">{o.relation || "—"}</Td>
                    <Td numeric>{o.bus_count}</Td>
                    <Td>
                      <StatusBadge status={o.status} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden" data-testid="bus-orders-mobile">
            {orders.items.map((o) => (
              <li key={o.id}>
                <ListCard
                  statusColor={statusColor(o.status)}
                  title={route(o)}
                  meta={`${date(o.order_date)}${o.call_time ? ` · ${o.call_time}` : ""}${o.relation ? ` · ${o.relation}` : ""}`}
                  aside={<StatusBadge status={o.status} />}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <nav aria-label="Pagination" className="flex items-center justify-between gap-2">
        <span className="text-small text-fg-muted">
          Page {orders.page} sur {Math.max(orders.totalPages, 1)}
        </span>
        <span className="flex gap-2">
          {orders.page > 1 ? (
            <Button asChild size="sm">
              <Link href={`/commandes?page=${orders.page - 1}${status ? `&statut=${status}` : ""}`}>
                Précédente
              </Link>
            </Button>
          ) : null}
          {orders.page < orders.totalPages ? (
            <Button asChild size="sm">
              <Link href={`/commandes?page=${orders.page + 1}${status ? `&statut=${status}` : ""}`}>
                Suivante
              </Link>
            </Button>
          ) : null}
        </span>
      </nav>
    </section>
  );
}
