import { Search } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ASSIST_STATUS, ASSIST_STATUSES } from "@/lib/pmr/model";

export type PmrFilters = { du?: string; au?: string; zone?: string; q?: string; statut?: string };

/** Filtres des prestations en GET (URL partageable, sans JS) + raccourcis de dates. */
export function PmrFilterBar({
  action,
  filters,
  zones,
  shortcuts,
}: {
  action: string;
  filters: PmrFilters;
  zones: { id: string; code: string }[];
  shortcuts: { label: string; du: string; au: string }[];
}) {
  const keep = Object.fromEntries(
    Object.entries({ zone: filters.zone, q: filters.q, statut: filters.statut }).filter(
      ([, v]) => v,
    ),
  ) as Record<string, string>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2" aria-label="Raccourcis de dates">
        {shortcuts.map((s) => {
          const active = filters.du === s.du && (filters.au ?? s.du) === s.au;
          return (
            <Button
              key={s.label}
              asChild
              size="sm"
              variant={active ? "primary" : "ghost"}
              className={active ? "" : "border border-border"}
            >
              <Link
                href={`${action}?${new URLSearchParams({ ...keep, du: s.du, au: s.au })}`}
                aria-current={active ? "true" : undefined}
              >
                {s.label}
              </Link>
            </Button>
          );
        })}
      </div>
      <form
        action={action}
        method="get"
        role="search"
        className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-end"
      >
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
        <label className="flex min-w-0 flex-col gap-1 md:w-32">
          <span className="text-small text-fg-muted">Zone</span>
          <Select name="zone" defaultValue={filters.zone ?? ""}>
            <option value="">Toutes</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.code}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-40">
          <span className="text-small text-fg-muted">Statut</span>
          <Select name="statut" defaultValue={filters.statut ?? ""}>
            <option value="">Tous</option>
            {ASSIST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ASSIST_STATUS[s].label}
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
      </form>
    </div>
  );
}
