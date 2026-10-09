import Form from "next/form";
import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { pl } from "@/lib/utils";
import { FormAutoSubmit } from "@/components/ui/form-auto-submit";
import { ClientBoard } from "@/components/pmr/client-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body text-fg-muted">
          <span className="font-mono text-fg tabular">{list.total}</span> {pl(list.total, "fiche")}
          {archived ? " archivée(s)" : ""}
        </p>
        <LiveRefresh topics={["pmr_clients"]} />
      </div>
      <Form action="/pmr/clients" role="search" className="flex flex-wrap items-end gap-2">
        <FormAutoSubmit />
        <label className="flex min-w-0 basis-full flex-col gap-1 md:max-w-80 md:flex-1 md:basis-auto">
          <span className="text-small text-fg-muted">Recherche</span>
          <span className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
            />
            <Input
              name="q"
              defaultValue={sp.q}
              placeholder="Nom, prénom, téléphone…"
              className="pl-9"
              maxLength={60}
            />
          </span>
        </label>
        {archived ? <input type="hidden" name="archives" value="1" /> : null}
        <Button type="submit" variant="secondary">
          Rechercher
        </Button>
        <Button asChild variant="ghost">
          <Link href={archived ? "/pmr/clients" : "/pmr/clients?archives=1"}>
            {archived ? "Fiches actives" : "Fiches archivées"}
          </Link>
        </Button>
      </Form>
      <ClientBoard
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
              <Button asChild size="sm">
                <Link href={qs(list.page - 1)}>Précédente</Link>
              </Button>
            ) : null}
            {list.page < list.totalPages ? (
              <Button asChild size="sm">
                <Link href={qs(list.page + 1)}>Suivante</Link>
              </Button>
            ) : null}
          </span>
        </nav>
      ) : null}
    </section>
  );
}
