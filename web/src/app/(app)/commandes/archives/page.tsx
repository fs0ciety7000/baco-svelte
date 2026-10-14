import { Download, ExternalLink, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ArchiveAdminBar, ArchiveDelete } from "@/components/orders/archive-tools";
import { OrderList } from "@/components/orders/order-list";
import { DateRangePicker } from "@/components/ui/date-field";
import { ChipRow, ClearFilters, FilterChip, FilterSubmit } from "@/components/ui/filters";
import { ORDER_ARCHIVE_DAYS } from "@/lib/orders/archive";
import { isValidDay } from "@/lib/orders/time";
import type { SessionUser } from "@/server/auth";
import { listOrders } from "@/server/data/orders";
import { Button } from "@/components/ui/button";
import { FilterForm } from "@/components/ui/filter-form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/status-badge";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { MonthField } from "@/components/ui/month-field";
import { formatShortDay } from "@/lib/orders/time";
import { can, isAdmin } from "@/lib/permissions";
import { pl } from "@/lib/utils";
import { archivesEnabled } from "@/server/archives";
import { requirePermission } from "@/server/auth";
import {
  archivePdfIndex,
  listArchiveBackups,
  listArchives,
  unarchivedOrders,
} from "@/server/data/archives";

export const metadata: Metadata = { title: "Archives des bons · CSM" };

// Archives des bons (demande du 11 oct. 2026) : récapitulatif des bons finalisés (référence TC_ / n° de taxi, trajet,
// date) avec leur PDF, et sauvegardes zip mensuelles. Lecture : `archives:read`.

// Depuis le 14 oct. 2026, deux vues : « Bons archivés » (défaut : bons envoyés / finalisés ou annulés depuis plus de 30
// jours, sortis des listes courantes ; lien vers la fiche en lecture et vers le PDF d'archive) et « PDF des bons » (les
// PDF archivés à la clôture et les sauvegardes mensuelles).

type SP = {
  vue?: string;
  type?: string;
  mois?: string;
  q?: string;
  page?: string;
  du?: string;
  au?: string;
};

function ArchiveTabs({ vue }: { vue: "bons" | "pdf" }) {
  return (
    <ChipRow aria-label="Vue des archives">
      <FilterChip asChild pressed={vue === "bons"}>
        <Link
          href="/commandes/archives"
          aria-current={vue === "bons" ? "page" : undefined}
          data-testid="archives-tab-bons"
        >
          Bons archivés
        </Link>
      </FilterChip>
      <FilterChip asChild pressed={vue === "pdf"}>
        <Link
          href="/commandes/archives?vue=pdf"
          aria-current={vue === "pdf" ? "page" : undefined}
          data-testid="archives-tab-pdf"
        >
          PDF des bons
        </Link>
      </FilterChip>
    </ChipRow>
  );
}

async function ArchivedOrders({ sp, user }: { sp: SP; user: SessionUser }) {
  const canBus = can(user, "otto:read");
  const canTaxi = can(user, "generate_taxi:read");
  const type = sp.type === "bus" || sp.type === "taxi" ? sp.type : "all";
  const from = isValidDay(sp.du ?? "") ? sp.du : undefined;
  const to = isValidDay(sp.au ?? "") ? sp.au : undefined;
  const [{ rows, total }, pdfs] = await Promise.all([
    listOrders(
      { kind: type, q: sp.q, from, to, archived: "only", limit: 100 },
      { userId: user.id, canBus, canTaxi, canPmr: can(user, "pmr:read") },
    ),
    archivePdfIndex(),
  ]);
  return (
    <>
      <FilterForm
        action="/commandes/archives"
        role="search"
        className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-end"
      >
        <label className="col-span-2 flex min-w-0 flex-col gap-1 md:w-72">
          <span className="text-small text-fg-muted">Recherche</span>
          <span className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
            />
            <Input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Gare, relation, n°…"
              className="pl-9"
              maxLength={100}
            />
          </span>
        </label>
        <label className="col-span-2 flex min-w-0 flex-col gap-1 md:w-36">
          <span className="text-small text-fg-muted">Type</span>
          <Select
            name="type"
            defaultValue={type === "all" ? "" : type}
            options={[
              { value: "", label: "Bus et taxis" },
              ...(canBus ? [{ value: "bus", label: "Bus" }] : []),
              ...(canTaxi ? [{ value: "taxi", label: "Taxis" }] : []),
            ]}
          />
        </label>
        <DateRangePicker
          nameFrom="du"
          nameTo="au"
          defaultFrom={from ?? ""}
          defaultTo={to ?? ""}
          presets={["7d", "week"]}
          fieldClassName="md:w-40"
        />
        <div className="col-span-2 flex gap-2">
          <FilterSubmit />
          {sp.q || sp.type || sp.du || sp.au ? <ClearFilters href="/commandes/archives" /> : null}
        </div>
      </FilterForm>
      <p className="text-small text-fg-muted" aria-live="polite" data-testid="archived-count">
        {total} {pl(total, "bon archivé", "bons archivés")} · envoyés ou annulés depuis plus de{" "}
        {ORDER_ARCHIVE_DAYS} jours (date de service ci-dessous).
      </p>
      <div data-testid="archived-orders">
        <OrderList
          rows={rows}
          total={total}
          pdfFor={pdfs}
          emptyText="Aucun bon archivé pour ces filtres. Un bon envoyé ou annulé arrive ici 30 jours après sa clôture."
        />
      </div>
    </>
  );
}

const monthLabel = new Intl.DateTimeFormat("fr-BE", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("archives:read");
  const sp = await searchParams;
  const admin = isAdmin(user);
  if (sp.vue !== "pdf") {
    return (
      <section className="flex min-w-0 flex-col gap-4" aria-label="Bons archivés">
        <ArchiveTabs vue="bons" />
        <ArchivedOrders sp={sp} user={user} />
      </section>
    );
  }
  const canDelete = can(user, "archives:delete");
  const [list, backups, pending] = await Promise.all([
    listArchives(sp),
    listArchiveBackups(),
    admin ? unarchivedOrders(0) : Promise.resolve(null),
  ]);
  const pendingCount = pending ? pending.remaining : 0;
  const keep = (extra: Record<string, string>) => {
    const q = new URLSearchParams(
      Object.entries({ vue: "pdf", type: sp.type, mois: sp.mois, q: sp.q, ...extra }).filter(
        (e): e is [string, string] => !!e[1],
      ),
    );
    return `/commandes/archives?${q}`;
  };

  return (
    <section className="flex min-w-0 flex-col gap-5" aria-label="Archives des bons">
      <ArchiveTabs vue="pdf" />
      {admin ? <ArchiveAdminBar pending={pendingCount} enabled={archivesEnabled()} /> : null}

      <FilterForm
        action="/commandes/archives"
        role="search"
        className="flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="vue" value="pdf" />
        <label className="flex min-w-0 flex-1 flex-col gap-1 md:max-w-80">
          <span className="text-small text-fg-muted">Recherche</span>
          <span className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
            />
            <Input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="TC_…, n° de taxi, gare…"
              className="pl-9"
              maxLength={60}
            />
          </span>
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-36">
          <span className="text-small text-fg-muted">Type</span>
          <Select
            name="type"
            defaultValue={sp.type ?? ""}
            options={[
              { value: "", label: "Bus et taxis" },
              { value: "bus", label: "Bus" },
              { value: "taxi", label: "Taxis" },
            ]}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-44">
          <span className="text-small text-fg-muted">Mois</span>
          <MonthField name="mois" defaultValue={sp.mois ?? ""} />
        </label>
        <FilterSubmit />
        {sp.q || sp.type || sp.mois ? <ClearFilters href="/commandes/archives?vue=pdf" /> : null}
      </FilterForm>

      <p className="text-small text-fg-muted" aria-live="polite">
        {list.total} {pl(list.total, "bon archivé", "bons archivés")}
      </p>

      {list.rows.length === 0 ? (
        <EmptyState
          title="Aucun bon archivé"
          description="Les bons finalisés (envoyés) apparaissent ici avec leur PDF."
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <Th>Référence</Th>
                  <Th>Trajet</Th>
                  <Th>Date</Th>
                  <Th>District</Th>
                  <Th>Archivé par</Th>
                  <Th>PDF</Th>
                </tr>
              </THead>
              <tbody data-testid="archives-table">
                {list.rows.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-medium">
                      <span className="flex items-center gap-2">
                        <Badge tone={r.kind === "bus" ? "info" : "neutral"}>
                          {r.kind === "bus" ? "Bus" : "Taxi"}
                        </Badge>
                        {r.reference}
                      </span>
                    </Td>
                    <Td>{r.route}</Td>
                    <Td className="font-mono text-small tabular">
                      {r.day ? formatShortDay(r.day) : "—"}
                    </Td>
                    <Td>{r.district || "—"}</Td>
                    <Td className="text-fg-muted">
                      {r.by || "—"}
                      {admin && !r.r2 && r.r2Error ? (
                        <span className="block text-hint text-danger" title={r.r2Error}>
                          R2 en attente
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <div className="flex gap-1">
                        <Button asChild size="sm" variant="ghost" className="border border-border">
                          <a
                            href={`/api/commandes/archives/${r.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Ouvrir le PDF ${r.reference}`}
                          >
                            <ExternalLink aria-hidden className="size-4" />
                          </a>
                        </Button>
                        <Button asChild size="sm" variant="ghost" className="border border-border">
                          <a
                            href={`/api/commandes/archives/${r.id}?dl=1`}
                            download
                            aria-label={`Télécharger le PDF ${r.reference}`}
                          >
                            <Download aria-hidden className="size-4" />
                          </a>
                        </Button>
                        {canDelete ? <ArchiveDelete id={r.id} label={r.reference} /> : null}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden" data-testid="archives-cards">
            {list.rows.map((r) => (
              <li key={r.id}>
                <a href={`/api/commandes/archives/${r.id}?dl=1`} download className="block">
                  <ListCard
                    title={`${r.kind === "bus" ? "Bus" : "Taxi"} · ${r.reference}`}
                    meta={`${r.route} · ${r.day ? formatShortDay(r.day) : "—"}`}
                    aside={<Download aria-hidden className="size-4 text-fg-muted" />}
                  />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {list.totalPages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-2">
          <span className="text-small text-fg-muted">
            Page {list.page} sur {list.totalPages}
          </span>
          <span className="flex gap-2">
            {list.page > 1 ? (
              <Button asChild variant="ghost" className="border border-border">
                <Link href={keep({ page: String(list.page - 1) })}>Précédente</Link>
              </Button>
            ) : null}
            {list.page < list.totalPages ? (
              <Button asChild variant="ghost" className="border border-border">
                <Link href={keep({ page: String(list.page + 1) })}>Suivante</Link>
              </Button>
            ) : null}
          </span>
        </nav>
      ) : null}

      <section className="flex flex-col gap-2" aria-labelledby="archives-backups">
        <h2 id="archives-backups" className="text-h3 font-semibold">
          Sauvegardes mensuelles
        </h2>
        <p className="text-small text-fg-muted">
          Chaque nuit, le zip des mois modifiés est refait sur le serveur
          {backups.some((b) => b.r2) ? " et copié dans le stockage R2" : ""}.
        </p>
        {backups.length === 0 ? (
          <p className="text-small text-fg-muted">Pas encore de sauvegarde.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="archives-backups">
            {backups.map((b) => (
              <li
                key={b.id}
                className="flex min-h-11 items-center gap-3 border border-border bg-surface px-3 py-2"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium capitalize">
                    {monthLabel.format(new Date(`${b.month}-01T00:00:00Z`))}
                  </span>
                  <span className="text-hint text-fg-muted">
                    {b.count} {pl(b.count, "bon")}
                    {b.r2 ? " · copie R2" : admin && b.r2Error ? " · R2 en attente" : ""}
                  </span>
                </span>
                <Button asChild size="sm" variant="ghost" className="border border-border">
                  <a
                    href={`/api/commandes/archives/sauvegardes/${b.id}`}
                    download
                    aria-label={`Télécharger la sauvegarde ${b.month}`}
                  >
                    <Download aria-hidden className="size-4" /> Zip
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
