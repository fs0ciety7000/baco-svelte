import type { Metadata } from "next";
import Link from "next/link";

import { AbbrBadge, OrDash, RefPager, RefSearchBar } from "@/components/referentiels/ref-ui";
import { Button } from "@/components/ui/button";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/misc";
import { requirePermission } from "@/server/auth";
import { listEbp } from "@/server/data/referentiels";

export const metadata: Metadata = { title: "EBP · CSM" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; incomplete?: string }>;
}) {
  await requirePermission("ebp:read");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const incomplete = sp.incomplete === "1";
  const { rows, total, page, totalPages } = await listEbp({ q, page: sp.page, incomplete });
  const params = { q, ...(incomplete ? { incomplete: "1" } : {}) };
  return (
    <section className="flex flex-col gap-4" aria-label="EBP">
      <RefSearchBar
        action="/referentiels/ebp"
        q={q}
        placeholder="Ligne, PtCar, abréviation, vue EBP…"
        hidden={incomplete ? { incomplete: "1" } : undefined}
      >
        <Button
          asChild
          variant={incomplete ? "primary" : "ghost"}
          className={incomplete ? "" : "border border-border"}
        >
          <Link
            href={`/referentiels/ebp?${new URLSearchParams(incomplete ? { q } : { q, incomplete: "1" }).toString()}`}
          >
            Incomplètes
          </Link>
        </Button>
      </RefSearchBar>
      <RefPager
        base="/referentiels/ebp"
        params={params}
        page={page}
        totalPages={totalPages}
        total={total}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="Aucune correspondance"
          description="Aucune vue EBP pour cette recherche."
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <Th>Lignes</Th>
                  <Th>PtCar</Th>
                  <Th>Abréviation</Th>
                  <Th>Vue EBP</Th>
                </tr>
              </THead>
              <tbody data-testid="ebp-table">
                {rows.map((r) => (
                  <Tr key={r.id}>
                    <Td>
                      <OrDash value={r.line} />
                    </Td>
                    <Td>
                      <OrDash value={r.ptcar} />
                    </Td>
                    <Td>{r.abbr ? <AbbrBadge abbr={r.abbr} /> : <OrDash value="" />}</Td>
                    <Td className="font-mono">
                      <OrDash value={r.ebpView} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden" data-testid="ebp-cards">
            {rows.map((r) => (
              <li key={r.id}>
                <ListCard
                  title={
                    <span className="inline-flex items-center gap-2 font-mono">
                      {r.ebpView || "—"}
                    </span>
                  }
                  meta={`${r.line || "—"} · ${r.abbr || "—"} · ${r.ptcar || "—"}`}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
