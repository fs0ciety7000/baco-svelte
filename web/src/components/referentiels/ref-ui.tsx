import Link from "next/link";

import { pl } from "@/lib/utils";
import { ClearFilters, FilterSubmit } from "@/components/ui/filters";
import { FilterForm } from "@/components/ui/filter-form";
import { Button } from "@/components/ui/button";
import { ListCount, TOOLBAR, ToolbarSearch } from "@/components/ui/list-toolbar";

// Éléments communs des référentiels en lecture (PtCar, EBP) : recherche en GET (URL partageable, sans JS) et
// pagination serveur. Tout est rendu côté serveur ; aucune donnée ne quitte le domaine CSM.

/** Barre de recherche en GET (le champ garde les autres filtres par des inputs cachés). */
export function RefSearchBar({
  action,
  q,
  placeholder,
  hidden,
  children,
}: {
  action: string;
  q: string;
  placeholder: string;
  hidden?: Record<string, string>;
  children?: React.ReactNode;
}) {
  return (
    <FilterForm action={action} role="search" className={TOOLBAR}>
      {Object.entries(hidden ?? {}).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      <ToolbarSearch defaultValue={q} placeholder={placeholder} className="md:w-80" />
      {children}
      <FilterSubmit />
      <ClearFilters href={action} />
    </FilterForm>
  );
}

/** Pagination serveur : précédent / suivant en liens (conserve les paramètres courants). */
export function RefPager({
  base,
  params,
  page,
  totalPages,
  total,
}: {
  base: string;
  params: Record<string, string>;
  page: number;
  totalPages: number;
  total: number;
}) {
  const href = (p: number) =>
    `${base}?${new URLSearchParams({ ...params, page: String(p) }).toString()}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-small text-fg-muted">
        <ListCount
          n={total}
          label={pl(total, "résultat")}
          extra={totalPages > 1 ? ` · page ${page}/${totalPages}` : ""}
        />
      </p>
      {totalPages > 1 ? (
        <div className="flex gap-2">
          <Button asChild variant="secondary" size="sm" disabled={page <= 1}>
            <Link href={href(Math.max(1, page - 1))} aria-disabled={page <= 1}>
              Précédent
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm" disabled={page >= totalPages}>
            <Link href={href(Math.min(totalPages, page + 1))} aria-disabled={page >= totalPages}>
              Suivant
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Code gare en mono (badge). */
export function AbbrBadge({ abbr }: { abbr: string }) {
  return (
    <span className="inline-flex items-center rounded-[min(var(--r-control),5px)] bg-surface-2 px-1.5 py-0.5 font-mono text-small font-medium text-fg">
      {abbr || "—"}
    </span>
  );
}

/** Cellule vide signalée (EBP à trous). */
export function OrDash({ value }: { value: string }) {
  return value ? <>{value}</> : <span className="text-fg-muted">—</span>;
}
