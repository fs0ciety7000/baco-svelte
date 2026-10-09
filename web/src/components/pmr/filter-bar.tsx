import { Search } from "lucide-react";
import Link from "next/link";

import { FilterForm } from "@/components/ui/filter-form";
import { Button } from "@/components/ui/button";
import { ChipRow, CollapsibleFilters, FilterChip } from "@/components/ui/filters";
import { FormAutoSubmit } from "@/components/ui/form-auto-submit";
import { Input, Select } from "@/components/ui/input";
import { DISTRICT_LABEL, DISTRICTS } from "@/lib/pmr/districts";
import { ASSIST_STATUS, ASSIST_STATUSES } from "@/lib/pmr/model";

export type PmrFilters = {
  du?: string;
  au?: string;
  district?: string;
  q?: string;
  statut?: string;
};

/** Filtres des missions PMR en GET (URL partageable, sans JS) + raccourcis de dates. */
export function PmrFilterBar({
  action,
  filters,
  shortcuts,
  statuses = ASSIST_STATUSES,
}: {
  action: string;
  filters: PmrFilters;
  shortcuts: { label: string; du: string; au: string }[];
  /** Statuts proposés (par défaut ceux des missions PMR). */
  statuses?: readonly string[];
}) {
  const keep = Object.fromEntries(
    Object.entries({ district: filters.district, q: filters.q, statut: filters.statut }).filter(
      ([, v]) => v,
    ),
  ) as Record<string, string>;
  return (
    <div className="flex flex-col gap-2">
      <ChipRow aria-label="Raccourcis de dates">
        {shortcuts.map((s) => {
          const active = filters.du === s.du && (filters.au ?? s.du) === s.au;
          return (
            <FilterChip key={s.label} asChild pressed={active}>
              <Link
                href={`${action}?${new URLSearchParams({ ...keep, du: s.du, au: s.au })}`}
                aria-current={active ? "true" : undefined}
              >
                {s.label}
              </Link>
            </FilterChip>
          );
        })}
      </ChipRow>
      <FilterForm
        action={action}
        role="search"
        className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-end"
      >
        <FormAutoSubmit />
        <label className="col-span-2 flex min-w-0 flex-col gap-1 md:w-60">
          <span className="text-small text-fg-muted">Recherche</span>
          <span className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
            />
            <Input
              name="q"
              defaultValue={filters.q}
              placeholder="Gare, train, réf. DICOS…"
              className="pl-9"
              maxLength={60}
            />
          </span>
        </label>
        <CollapsibleFilters active={[filters.district, filters.statut].filter(Boolean).length}>
          <label className="flex min-w-0 flex-col gap-1 md:w-40">
            <span className="text-small text-fg-muted">District</span>
            <Select name="district" defaultValue={filters.district ?? ""}>
              <option value="">Tous</option>
              {DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d} · {DISTRICT_LABEL[d]}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 md:w-40">
            <span className="text-small text-fg-muted">Statut</span>
            <Select name="statut" defaultValue={filters.statut ?? ""}>
              <option value="">Tous</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {ASSIST_STATUS[s as keyof typeof ASSIST_STATUS]?.label ?? s}
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
        </CollapsibleFilters>
      </FilterForm>
    </div>
  );
}
