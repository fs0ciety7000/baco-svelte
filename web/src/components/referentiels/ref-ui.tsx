import { Search } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <form action={action} method="get" role="search" className="flex flex-wrap items-end gap-2">
      {Object.entries(hidden ?? {}).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      <label className="flex min-w-0 flex-1 flex-col gap-1 md:max-w-80">
        <span className="text-small text-fg-muted">Recherche</span>
        <span className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder={placeholder}
            className="pl-9"
            maxLength={60}
          />
        </span>
      </label>
      {children}
      <Button type="submit" variant="secondary">
        Filtrer
      </Button>
      {q ? (
        <Button asChild variant="ghost">
          <Link href={action}>Effacer</Link>
        </Button>
      ) : null}
    </form>
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
        <span className="font-mono text-fg tabular">{total}</span> résultat(s)
        {totalPages > 1 ? ` · page ${page}/${totalPages}` : ""}
      </p>
      {totalPages > 1 ? (
        <div className="flex gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="border border-border"
            disabled={page <= 1}
          >
            <Link href={href(Math.max(1, page - 1))} aria-disabled={page <= 1}>
              Précédent
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="border border-border"
            disabled={page >= totalPages}
          >
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
    <span className="inline-flex items-center rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-small text-fg">
      {abbr || "—"}
    </span>
  );
}

/** Cellule vide signalée (EBP à trous). */
export function OrDash({ value }: { value: string }) {
  return value ? <>{value}</> : <span className="text-fg-muted">—</span>;
}
