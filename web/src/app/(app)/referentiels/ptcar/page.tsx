import type { Metadata } from "next";

import { AbbrBadge, RefPager, RefSearchBar } from "@/components/referentiels/ref-ui";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/misc";
import { requirePermission } from "@/server/auth";
import { listPtcar } from "@/server/data/referentiels";

export const metadata: Metadata = { title: "PtCar · CSM" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requirePermission("ptcar:read");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const { rows, total, page, totalPages } = await listPtcar({ q, page: sp.page });
  return (
    <section className="flex flex-col gap-4" aria-label="PtCar">
      <RefSearchBar action="/referentiels/ptcar" q={q} placeholder="Abréviation, nom FR ou NL…" />
      <RefPager base="/referentiels/ptcar" params={{ q }} page={page} totalPages={totalPages} total={total} />
      {rows.length === 0 ? (
        <EmptyState title="Aucune gare" description="Aucun code PtCar pour cette recherche." />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <Th>Abréviation</Th>
                  <Th>Nom (FR)</Th>
                  <Th>Nom (NL)</Th>
                </tr>
              </THead>
              <tbody data-testid="ptcar-table">
                {rows.map((r) => (
                  <Tr key={r.id}>
                    <Td>
                      <AbbrBadge abbr={r.abbr} />
                    </Td>
                    <Td>{r.nameFr || "—"}</Td>
                    <Td className="text-fg-muted">{r.nameNl || "—"}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden" data-testid="ptcar-cards">
            {rows.map((r) => (
              <li key={r.id}>
                <ListCard
                  title={
                    <span className="inline-flex items-center gap-2">
                      <AbbrBadge abbr={r.abbr} /> {r.nameFr || "—"}
                    </span>
                  }
                  meta={r.nameNl}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
