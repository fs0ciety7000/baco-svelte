import Form from "next/form";
import { Search } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { StatusBadge, statusColor } from "@/components/ui/status-badge";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { DISTRICTS } from "@/lib/orders/schemas";
import { ORDER_STATUSES, STATUS_LABEL, type OrderKind } from "@/lib/orders/status";
import { addDays, brusselsDay, formatDay } from "@/lib/orders/time";
import type { OrderRow } from "@/server/data/orders";

import { KindIconClient } from "./kind-icon";

export function orderHref(r: { kind: OrderKind; id: string }) {
  return r.kind === "bus" ? `/commandes/bus/${r.id}` : `/commandes/taxi/${r.id}`;
}

export function routeLabel(r: OrderRow) {
  return `${r.origin || "?"} → ${r.destination || "?"}`;
}

export type ListFilters = {
  q?: string;
  statut?: string;
  du?: string;
  au?: string;
  district?: string;
};

/** Barre de filtres en GET (fonctionne sans JS, URL partageable) + raccourcis de dates. */
export function FilterBar({ action, filters }: { action: string; filters: ListFilters }) {
  const today = brusselsDay();
  const shortcut = (label: string, du: string, au: string) => {
    const params = new URLSearchParams({ ...clean(filters), du, au });
    const active = filters.du === du && filters.au === au;
    return (
      <Button
        asChild
        size="sm"
        variant={active ? "primary" : "ghost"}
        className={active ? "" : "border border-border"}
      >
        <Link href={`${action}?${params}`} aria-current={active ? "true" : undefined}>
          {label}
        </Link>
      </Button>
    );
  };
  return (
    <div className="flex flex-col gap-2">
      <Form
        action={action}
        className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-end"
        role="search"
      >
        <label className="col-span-2 flex min-w-0 flex-col gap-1 md:w-64">
          <span className="text-small text-fg-muted">Recherche</span>
          <span className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
            />
            <Input
              name="q"
              defaultValue={filters.q}
              placeholder="Gare, relation, n°…"
              className="pl-9"
              maxLength={100}
            />
          </span>
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-40">
          <span className="text-small text-fg-muted">Statut</span>
          <Select name="statut" defaultValue={filters.statut ?? ""}>
            <option value="">Tous</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-40">
          <span className="text-small text-fg-muted">District</span>
          <Select name="district" defaultValue={filters.district ?? ""}>
            <option value="">Tous</option>
            {DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-40">
          <span className="text-small text-fg-muted">Du</span>
          <Input type="date" name="du" defaultValue={filters.du} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-40">
          <span className="text-small text-fg-muted">Au</span>
          <Input type="date" name="au" defaultValue={filters.au} />
        </label>
        <div className="col-span-2 flex gap-2">
          <Button type="submit" variant="secondary">
            Filtrer
          </Button>
          <Button asChild variant="ghost">
            <Link href={action}>Effacer</Link>
          </Button>
        </div>
      </Form>
      <div className="flex flex-wrap gap-2" aria-label="Raccourcis de dates">
        {shortcut("Aujourd'hui", today, today)}
        {shortcut("Hier", addDays(today, -1), addDays(today, -1))}
        {shortcut("Demain", addDays(today, 1), addDays(today, 1))}
        {shortcut("7 derniers jours", addDays(today, -6), today)}
      </div>
    </div>
  );
}

function clean(f: ListFilters): Record<string, string> {
  return Object.fromEntries(
    Object.entries(f).filter(([, v]) => typeof v === "string" && v),
  ) as Record<string, string>;
}

/** Liste de commandes : table dense en desktop, cartes en mobile ; chaque ligne mène à la commande. */
export function OrderList({
  rows,
  total,
  emptyText,
}: {
  rows: OrderRow[];
  total: number;
  emptyText: string;
}) {
  if (rows.length === 0) return <EmptyState title="Aucune commande" description={emptyText} />;
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <THead>
            <tr>
              <Th>N°</Th>
              <Th>Date</Th>
              <Th>Heure</Th>
              <Th>Trajet</Th>
              <Th>Société</Th>
              <Th>Relation</Th>
              <Th numeric>Véh.</Th>
              <Th>Statut</Th>
            </tr>
          </THead>
          <tbody data-testid="orders-table">
            {rows.map((r) => (
              <Tr
                key={`${r.kind}-${r.id}`}
                statusColor={statusColor(r.status)}
                className="relative"
              >
                <Td className="font-mono text-fg-muted">
                  <span className="inline-flex items-center gap-2">
                    <KindIconClient kind={r.kind} pmr={r.isPmr} />
                    {/* Lien étiré : toute la ligne est cliquable, le lien reste le seul élément focalisable. */}
                    <Link
                      href={orderHref(r)}
                      className="after:absolute after:inset-0 focus-visible:outline-1 focus-visible:outline-accent"
                    >
                      {r.number || "—"}
                    </Link>
                  </span>
                </Td>
                <Td className="font-mono tabular">{formatDay(r.day)}</Td>
                <Td className="font-mono tabular">{r.time || "—"}</Td>
                <Td className={`max-w-72 truncate ${r.status === "annule" ? "line-through" : ""}`}>
                  {routeLabel(r)}
                </Td>
                <Td className="max-w-48 truncate">{r.company || "—"}</Td>
                <Td className="max-w-40 truncate text-fg-muted">{r.relation || "—"}</Td>
                <Td numeric>{r.busCount}</Td>
                <Td>
                  <StatusBadge status={r.status} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden" data-testid="orders-cards">
        {rows.map((r) => (
          <li key={`${r.kind}-${r.id}`}>
            <Link
              href={orderHref(r)}
              className="block focus-visible:outline-1 focus-visible:outline-accent"
            >
              <ListCard
                statusColor={statusColor(r.status)}
                title={
                  <span className="inline-flex items-center gap-2">
                    <KindIconClient kind={r.kind} pmr={r.isPmr} />
                    {routeLabel(r)}
                  </span>
                }
                meta={`n° ${r.number} · ${formatDay(r.day)}${r.time ? ` ${r.time}` : ""}${r.company ? ` · ${r.company}` : ""}`}
                aside={<StatusBadge status={r.status} />}
              />
            </Link>
          </li>
        ))}
      </ul>
      {total > rows.length ? (
        <p className="text-small text-fg-muted">
          {rows.length} commandes affichées sur {total} : affinez les filtres pour voir les autres.
        </p>
      ) : null}
    </>
  );
}
