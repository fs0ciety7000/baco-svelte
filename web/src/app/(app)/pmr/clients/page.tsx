import type { Metadata } from "next";
import Link from "next/link";

import { pl } from "@/lib/utils";
import { FilterForm } from "@/components/ui/filter-form";
import { FormAutoSubmit } from "@/components/ui/form-auto-submit";
import { ClientBoard } from "@/components/pmr/client-board";
import { Button } from "@/components/ui/button";
import { SegmentedNav } from "@/components/ui/filters";
import { ListCount, TOOLBAR, ToolbarSearch } from "@/components/ui/list-toolbar";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { listClients } from "@/server/data/pmr";

import { LiveRefresh } from "../../commandes/live-refresh";

export const metadata: Metadata = { title: "Clients PMR · CSM" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; archives?: string; id?: string }>;
}) {
  const user = await requirePermission("pmr:read");
  const sp = await searchParams;
  const archived = sp.archives === "1";
  const list = await listClients({ q: sp.q, page: Number(sp.page) || 1, archived });
  const qs = (page: number) =>
    `/pmr/clients?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(archived ? { archives: "1" } : {}), page: String(page) })}`;
  return (
    <section className="flex flex-col gap-4" aria-label="Clients PMR">
      {/* Barre d'outils sur une ligne (v4 lot 6) : fiches actives / archivées, recherche, direct à droite. */}
      <FilterForm
        action="/pmr/clients"
        role="search"
        className={TOOLBAR}
        data-testid="clients-toolbar"
      >
        <FormAutoSubmit />
        <SegmentedNav
          label="Fiches"
          items={[
            { label: "Fiches actives", href: "/pmr/clients", current: !archived },
            { label: "Fiches archivées", href: "/pmr/clients?archives=1", current: archived },
          ]}
        />
        <ToolbarSearch defaultValue={sp.q} placeholder="Nom, prénom, téléphone…" />
        {archived ? <input type="hidden" name="archives" value="1" /> : null}
        <button type="submit" tabIndex={-1} aria-hidden className="sr-only">
          Rechercher
        </button>
        <span className="ml-auto">
          <LiveRefresh topics={["pmr_clients"]} />
        </span>
      </FilterForm>
      <ClientBoard
        status={
          <ListCount
            n={list.total}
            label={
              archived
                ? pl(list.total, "fiche archivée", "fiches archivées")
                : pl(list.total, "fiche")
            }
          />
        }
        rows={list.rows}
        canWrite={can(user, "pmr:write")}
        openId={/^[a-z0-9]{15}$/.test(sp.id ?? "") ? sp.id : undefined}
      />
      {list.totalPages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-2">
          <span className="text-small text-fg-muted">
            Page {list.page} sur {list.totalPages}
          </span>
          <span className="flex gap-2">
            {list.page > 1 ? (
              <Button asChild size="sm" variant="secondary">
                <Link href={qs(list.page - 1)}>Précédente</Link>
              </Button>
            ) : null}
            {list.page < list.totalPages ? (
              <Button asChild size="sm" variant="secondary">
                <Link href={qs(list.page + 1)}>Suivante</Link>
              </Button>
            ) : null}
          </span>
        </nav>
      ) : null}
    </section>
  );
}
