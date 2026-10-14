import { FileText, Search } from "lucide-react";
import Link from "next/link";

import { DateRangePicker } from "@/components/ui/date-field";
import { FilterForm } from "@/components/ui/filter-form";
import {
  ChipRow,
  ClearFilters,
  CollapsibleFilters,
  FilterChip,
  FilterSubmit,
} from "@/components/ui/filters";
import { Input } from "@/components/ui/input";
import { Select as CustomSelect } from "@/components/ui/select";
import { LiveHighlight } from "@/components/ui/live-highlight";
import { EmptyState } from "@/components/ui/misc";
import { StatusBadge, statusColor } from "@/components/ui/status-badge";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { DistrictPicker } from "@/components/ui/district-picker";
import { appendDistricts, DISTRICT_NAME_OPTIONS, parseDistricts } from "@/lib/district-param";
import { DISTRICTS } from "@/lib/orders/schemas";
import { ORDER_STATUSES, STATUS_LABEL, type OrderKind } from "@/lib/orders/status";
import { addDays, brusselsDay, formatDay } from "@/lib/orders/time";
import { routeWithVias } from "@/lib/orders/via";
import type { OrderRow } from "@/server/data/orders";

import { ArchivedBadge } from "./archived-badge";
import { KindIconClient } from "./kind-icon";

export function orderHref(r: { kind: OrderKind; id: string }) {
  return r.kind === "bus" ? `/commandes/bus/${r.id}` : `/commandes/taxi/${r.id}`;
}

export function routeLabel(r: Pick<OrderRow, "origin" | "destination"> & { via?: string[] }) {
  return routeWithVias(r.origin, r.via ?? [], r.destination);
}

export type ListFilters = {
  q?: string;
  statut?: string;
  du?: string;
  au?: string;
  /** Un ou plusieurs districts (noms, paramètre répété : `DistrictPicker`). */
  district?: string | string[];
};

/** Barre de filtres en GET (fonctionne sans JS, URL partageable) + raccourcis de dates. */
export function FilterBar({
  action,
  filters,
  defaultPeriod,
}: {
  action: string;
  filters: ListFilters;
  /** Période par défaut de la liste (bons bus : J-1 → J+6) : ajoute les puces « 7 jours » et « Toutes les dates ». */
  defaultPeriod?: { du: string; au: string };
}) {
  const today = brusselsDay();
  const districts = parseDistricts(filters.district, DISTRICTS);
  const allDates = new URLSearchParams({ ...clean(filters), du: "", au: "" });
  appendDistricts(allDates, districts);
  const noDates = !filters.du && !filters.au;
  const shortcut = (label: string, du: string, au: string) => {
    const params = appendDistricts(new URLSearchParams({ ...clean(filters), du, au }), districts);
    const active = filters.du === du && filters.au === au;
    return (
      <FilterChip key={label} asChild pressed={active}>
        <Link href={`${action}?${params}`} aria-current={active ? "true" : undefined}>
          {label}
        </Link>
      </FilterChip>
    );
  };
  return (
    <div className="flex flex-col gap-2">
      <ChipRow aria-label="Raccourcis de dates">
        {shortcut("Aujourd'hui", today, today)}
        {shortcut("Hier", addDays(today, -1), addDays(today, -1))}
        {shortcut("Demain", addDays(today, 1), addDays(today, 1))}
        {shortcut("7 derniers jours", addDays(today, -6), today)}
        {defaultPeriod ? shortcut("Semaine (J-1 → J+6)", defaultPeriod.du, defaultPeriod.au) : null}
        {defaultPeriod ? (
          <FilterChip asChild pressed={noDates}>
            <Link
              href={`${action}?${allDates}`}
              aria-current={noDates ? "true" : undefined}
              data-testid="all-dates"
            >
              Toutes les dates
            </Link>
          </FilterChip>
        ) : null}
      </ChipRow>
      <FilterForm
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
        <CollapsibleFilters
          active={
            [filters.statut, districts.length ? "d" : "", filters.du, filters.au].filter(Boolean)
              .length
          }
        >
          <label className="flex min-w-0 flex-col gap-1 md:w-40">
            <span className="text-small text-fg-muted">Statut</span>
            <CustomSelect
              name="statut"
              defaultValue={filters.statut ?? ""}
              options={[
                { value: "", label: "Tous" },
                ...ORDER_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
              ]}
            />
          </label>
          <div className="col-span-2 flex min-w-0 flex-col gap-1 md:w-auto">
            <span className="text-small text-fg-muted">District</span>
            <DistrictPicker
              name="district"
              label="District"
              options={DISTRICT_NAME_OPTIONS}
              defaultValues={districts}
            />
          </div>
          <DateRangePicker
            nameFrom="du"
            nameTo="au"
            defaultFrom={filters.du ?? ""}
            defaultTo={filters.au ?? ""}
            presets={["today", "tomorrow", "7d", "week"]}
            fieldClassName="md:w-40"
          />
          <div className="col-span-2 flex gap-2">
            <FilterSubmit />
            <ClearFilters href={action} />
          </div>
        </CollapsibleFilters>
      </FilterForm>
    </div>
  );
}

/** Filtres simples (une valeur) ; les districts, répétés, sont ajoutés par `appendDistricts`. */
function clean(f: ListFilters): Record<string, string> {
  return Object.fromEntries(
    Object.entries(f).filter(([k, v]) => k !== "district" && typeof v === "string" && v),
  ) as Record<string, string>;
}

/** Liste de commandes : table dense en desktop, cartes en mobile ; chaque ligne mène à la commande. */
export function OrderList({
  rows,
  total,
  emptyText,
  context = "",
  pdfFor,
}: {
  rows: OrderRow[];
  total: number;
  emptyText: string;
  /** Filtres affichés (signal des changements en direct seulement à filtres égaux). */
  context?: string;
  /** Page Archives : PDF archivé de chaque bon (`kind-id` → id de l'archive) ; ajoute la colonne PDF. */
  pdfFor?: Record<string, string>;
}) {
  if (rows.length === 0) return <EmptyState title="Aucune commande" description={emptyText} />;
  return (
    <>
      <LiveHighlight
        scope="orders"
        context={context}
        sigs={Object.fromEntries(
          rows.map((r) => [`${r.kind}-${r.id}`, `${r.status}|${r.updated}`]),
        )}
      />
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
              {pdfFor ? <Th>PDF</Th> : null}
            </tr>
          </THead>
          <tbody data-testid="orders-table" data-hl-scope="orders">
            {rows.map((r) => (
              <Tr
                key={`${r.kind}-${r.id}`}
                data-hl={`${r.kind}-${r.id}`}
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
                  <span className="inline-flex items-center gap-1.5">
                    <StatusBadge status={r.status} />
                    {r.archived ? <ArchivedBadge /> : null}
                  </span>
                </Td>
                {pdfFor ? (
                  <Td>
                    {pdfFor[`${r.kind}-${r.id}`] ? (
                      <a
                        href={`/api/commandes/archives/${pdfFor[`${r.kind}-${r.id}`]}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative z-10 inline-flex min-h-11 items-center gap-1 link"
                        aria-label={`PDF archivé du bon n° ${r.number}`}
                      >
                        <FileText aria-hidden className="size-4" /> PDF
                      </a>
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </Td>
                ) : null}
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <ul
        className="flex flex-col gap-2 md:hidden"
        data-testid="orders-cards"
        data-hl-scope="orders"
      >
        {rows.map((r) => (
          <li key={`${r.kind}-${r.id}`}>
            <Link
              href={orderHref(r)}
              className="block focus-visible:outline-1 focus-visible:outline-accent"
            >
              <ListCard
                data-hl={`${r.kind}-${r.id}`}
                statusColor={statusColor(r.status)}
                title={
                  <span className="inline-flex items-center gap-2">
                    <KindIconClient kind={r.kind} pmr={r.isPmr} />
                    {routeLabel(r)}
                  </span>
                }
                meta={`n° ${r.number} · ${formatDay(r.day)}${r.time ? ` ${r.time}` : ""}${r.company ? ` · ${r.company}` : ""}`}
                aside={
                  <span className="flex flex-col items-end gap-1">
                    <StatusBadge status={r.status} />
                    {r.archived ? <ArchivedBadge /> : null}
                  </span>
                }
              />
            </Link>
            {pdfFor?.[`${r.kind}-${r.id}`] ? (
              <a
                href={`/api/commandes/archives/${pdfFor[`${r.kind}-${r.id}`]}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex min-h-11 items-center gap-1 px-1 text-small link"
              >
                <FileText aria-hidden className="size-4" /> PDF archivé
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      {total > rows.length ? (
        <p className="text-small text-fg-muted">
          {rows.length} commandes affichées sur {total} : affine les filtres pour voir les autres.
        </p>
      ) : null}
    </>
  );
}
