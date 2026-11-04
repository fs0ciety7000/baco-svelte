import type { Metadata } from "next";
import Link from "next/link";

import {
  AbbrBadge,
  AdminEditLink,
  OrDash,
  RefPager,
  RefSearchBar,
} from "@/components/referentiels/ref-ui";
import { EmptyState } from "@/components/ui/misc";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { can } from "@/lib/permissions";
import { requireRoute } from "@/server/auth";
import { adminSpi } from "@/server/data/admin-referentiels";

export const metadata: Metadata = { title: "Points SPI · CSM" };

const lineHref = (line: string) =>
  `/reseau/lignes?ligne=${encodeURIComponent(line.replace(/^L\.?\s*/i, ""))}`;

/**
 * Réseau › Points SPI (4 nov. 2026) : consultation des points SPI par ligne (`spi:read`), même liste que
 * Administration › Référentiels › Points SPI, sans modification. Lien vers l'administration avec `referentiels:manage`.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await requireRoute("/reseau/spi");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const { rows, total, page, totalPages } = await adminSpi({ q, page: sp.page });
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label="Points SPI">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <RefSearchBar action="/reseau/spi" q={q} placeholder="Ligne, lieu, zone, adresse…" />
        </div>
        <AdminEditLink href="/admin/referentiels/spi" show={can(user, "referentiels:manage")} />
      </div>
      <RefPager
        base="/reseau/spi"
        params={{ q }}
        page={page}
        totalPages={totalPages}
        total={total}
      />
      {rows.length === 0 ? (
        <EmptyState
          framed
          title="Aucun point SPI"
          description={q ? "Aucun point SPI pour cette recherche." : "Aucun point SPI enregistré."}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <Th>Ligne</Th>
                  <Th>Lieu</Th>
                  <Th>Zone</Th>
                  <Th>Adresse</Th>
                  <Th>Remarques</Th>
                </tr>
              </THead>
              <tbody data-testid="spi-table">
                {rows.map((r) => (
                  <Tr key={r.id}>
                    <Td>
                      <Link href={lineHref(r.line)} className="link font-mono">
                        {r.line}
                      </Link>
                    </Td>
                    <Td>
                      <OrDash value={r.place} />
                    </Td>
                    <Td>{r.zone ? <AbbrBadge abbr={r.zone} /> : <OrDash value="" />}</Td>
                    <Td>
                      <OrDash value={r.address} />
                    </Td>
                    <Td className="max-w-80 text-small whitespace-pre-wrap text-fg-muted">
                      {r.notes}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden" data-testid="spi-cards">
            {rows.map((r) => (
              <li key={r.id}>
                <ListCard
                  title={
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span className="font-mono">{r.line}</span>
                      {r.place || "Lieu non renseigné"}
                      {r.zone ? <AbbrBadge abbr={r.zone} /> : null}
                    </span>
                  }
                  meta={[r.address, r.notes].filter(Boolean).join(" · ")}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
