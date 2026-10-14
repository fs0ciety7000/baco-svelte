import type { Metadata } from "next";
import Link from "next/link";

import { LinesAdmin } from "@/components/admin/referentiels/lines-admin";
import { RefSearchBar } from "@/components/referentiels/ref-ui";
import { ChipRow, FilterChip } from "@/components/ui/filters";
import { pl } from "@/lib/utils";
import { requirePermission } from "@/server/auth";
import { adminLines, LINE_ISSUES } from "@/server/data/admin-referentiels";

export const metadata: Metadata = { title: "Lignes · Référentiels · CSM" };

type Search = { q?: string; anomalie?: string };

/** Administration › Référentiels › Lignes : état des lignes, création d'une ligne absente, suppression d'une manuelle. */
export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("referentiels:manage");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 60);
  const anomalie = sp.anomalie && sp.anomalie in LINE_ISSUES ? sp.anomalie : "";
  const { rows, total } = await adminLines({ q, anomalie });
  const href = (a: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (a) p.set("anomalie", a);
    const s = p.toString();
    return s ? `/admin/referentiels/lignes?${s}` : "/admin/referentiels/lignes";
  };
  return (
    <section className="flex flex-col gap-3" aria-label="Lignes">
      <RefSearchBar
        action="/admin/referentiels/lignes"
        q={q}
        placeholder="Numéro ou nom de ligne…"
        hidden={anomalie ? { anomalie } : undefined}
      />
      <ChipRow aria-label="Contrôle qualité">
        <FilterChip asChild pressed={!anomalie}>
          <Link href={href("")}>Toutes</Link>
        </FilterChip>
        {Object.entries(LINE_ISSUES).map(([k, v]) => (
          <FilterChip key={k} asChild pressed={anomalie === k}>
            <Link href={href(k)}>{v.label}</Link>
          </FilterChip>
        ))}
      </ChipRow>
      <p className="text-small text-fg-muted">
        <span className="font-mono text-fg tabular">{total}</span> {pl(total, "ligne")} · les gares
        d&apos;une ligne se corrigent dans sa fiche (crayon), comme depuis Réseau › Lignes.
      </p>
      <LinesAdmin rows={rows} />
    </section>
  );
}
