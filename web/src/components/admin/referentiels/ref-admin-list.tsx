import Link from "next/link";
import type { ReactNode } from "react";

import { RefPager, RefSearchBar } from "@/components/referentiels/ref-ui";
import { ChipRow, FilterChip } from "@/components/ui/filters";

/**
 * Cadre commun des listes d'Administration › Référentiels : recherche (GET), puces d'anomalies (contrôle qualité),
 * pagination serveur, puis la liste de gestion.
 */
export function RefAdminList({
  base,
  q,
  anomalie,
  issues,
  page,
  totalPages,
  total,
  placeholder,
  children,
}: {
  base: string;
  q: string;
  anomalie: string;
  issues: Record<string, { label: string }>;
  page: number;
  totalPages: number;
  total: number;
  placeholder: string;
  children: ReactNode;
}) {
  const href = (a: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (a) p.set("anomalie", a);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  return (
    <section className="flex flex-col gap-3">
      <RefSearchBar
        action={base}
        q={q}
        placeholder={placeholder}
        hidden={anomalie ? { anomalie } : undefined}
      />
      <ChipRow aria-label="Contrôle qualité">
        <FilterChip asChild pressed={!anomalie}>
          <Link href={href("")}>Toutes</Link>
        </FilterChip>
        {Object.entries(issues).map(([k, v]) => (
          <FilterChip key={k} asChild pressed={anomalie === k}>
            <Link href={href(k)} data-testid={`ref-issue-${k}`}>
              {v.label}
            </Link>
          </FilterChip>
        ))}
      </ChipRow>
      <RefPager
        base={base}
        params={{ ...(q ? { q } : {}), ...(anomalie ? { anomalie } : {}) }}
        page={page}
        totalPages={totalPages}
        total={total}
      />
      {children}
    </section>
  );
}
