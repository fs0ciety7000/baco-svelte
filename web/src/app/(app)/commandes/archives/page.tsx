import { Download, ExternalLink, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ArchiveAdminBar, ArchiveDelete } from "@/components/orders/archive-tools";
import { ArchiveWeeks, BillingLinks } from "@/components/orders/archive-weeks";
import { DUTY_SHORT } from "@/lib/ops/log";
import { recapItems, recapWeeks } from "@/lib/orders/recap";
import { isoWeekOf, monthBounds, monthLabelFr, weekBounds, weekKeyOf } from "@/lib/orders/week";
import { userDistricts } from "@/lib/team";
import { recapOrders } from "@/server/data/recap";
import { OrderList } from "@/components/orders/order-list";
import { DateRangePicker } from "@/components/ui/date-field";
import {
  ClearFilters,
  CollapsibleFilters,
  FilterSubmit,
  SegmentedNav,
} from "@/components/ui/filters";
import { ORDER_ARCHIVE_DAYS } from "@/lib/orders/archive";
import { brusselsDay, isValidDay } from "@/lib/orders/time";
import type { SessionUser } from "@/server/auth";
import { listOrders } from "@/server/data/orders";
import { Button } from "@/components/ui/button";
import { FilterForm } from "@/components/ui/filter-form";
import { TOOLBAR, ToolbarSearch } from "@/components/ui/list-toolbar";
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
  district?: string;
};

/** Vue des archives en contrôle segmenté, en tête de la barre d'outils (v4 lot 6). */
function ArchiveTabs({ vue }: { vue: "bons" | "semaines" | "pdf" }) {
  return (
    <SegmentedNav
      label="Vue des archives"
      items={[
        {
          label: "Bons archivés",
          href: "/commandes/archives",
          current: vue === "bons",
          testId: "archives-tab-bons",
        },
        {
          label: "Récap par semaine",
          href: "/commandes/archives?vue=semaines",
          current: vue === "semaines",
          testId: "archives-tab-semaines",
        },
        {
          label: "PDF des bons",
          href: "/commandes/archives?vue=pdf",
          current: vue === "pdf",
          testId: "archives-tab-pdf",
        },
      ]}
      scroll
    />
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
        className={TOOLBAR}
        data-testid="archives-toolbar"
      >
        <ArchiveTabs vue="bons" />
        <ToolbarSearch
          defaultValue={sp.q ?? ""}
          placeholder="Gare, relation, n°…"
          maxLength={100}
        />
        <label className="min-w-44 flex-1 md:min-w-0 md:w-40 md:flex-none">
          <span className="sr-only">Type</span>
          <Select
            name="type"
            label="Type"
            defaultValue={type === "all" ? "" : type}
            options={[
              { value: "", label: "Bus et taxis" },
              ...(canBus ? [{ value: "bus", label: "Bus" }] : []),
              ...(canTaxi ? [{ value: "taxi", label: "Taxis" }] : []),
            ]}
          />
        </label>
        <CollapsibleFilters always active={Number(!!from) + Number(!!to)}>
          <DateRangePicker
            nameFrom="du"
            nameTo="au"
            defaultFrom={from ?? ""}
            defaultTo={to ?? ""}
            presets={["7d", "week"]}
            fieldClassName="md:w-40"
          />
        </CollapsibleFilters>
        <ClearFilters href="/commandes/archives" />
        <FilterSubmit />
      </FilterForm>
      <p className="text-small text-fg-muted" aria-live="polite" data-testid="archived-count">
        <span className="font-medium text-fg tabular">{total}</span>{" "}
        {pl(total, "bon archivé", "bons archivés")} · envoyés ou annulés depuis plus de{" "}
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

/**
 * Récap par semaine (4 nov. 2026) : bons terminés, envoyés ou annulés des semaines ISO qui touchent le mois choisi, par
 * semaine ; zip de la semaine, PDF mensuel et fichier « Transports alternatifs » de la facturation (par district).
 */
async function WeeklyRecap({ sp, user }: { sp: SP; user: SessionUser }) {
  const today = brusselsDay();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mois ?? "") ? sp.mois! : today.slice(0, 7);
  // District : choisi, sinon le district du jour de l'agent s'il n'en a qu'un ; « tous » = aucun filtre.
  const duty = userDistricts(user, today)
    .map((d) => DUTY_SHORT[d] ?? "")
    .filter(Boolean);
  const district =
    sp.district === "tous"
      ? ""
      : ((["DSO", "DSE", "DCE"] as const).find((d) => d === sp.district) ??
        (sp.district === undefined && duty.length === 1 ? duty[0]! : ""));
  const m = monthBounds(month);
  const from = weekBounds(isoWeekOf(m.from)).from;
  const to = weekBounds(isoWeekOf(m.to)).to;
  const [data, pdfs] = await Promise.all([
    recapOrders(user, { from, to, districts: district ? [district] : [] }),
    archivePdfIndex(),
  ]);
  const weeks = recapWeeks(recapItems(data));
  const current = weekKeyOf(today);
  const openKey = weeks.some((w) => w.key === current) ? current : (weeks[0]?.key ?? "");
  const monthQuery = district ? `?district=${district}` : "";
  return (
    <>
      <FilterForm
        action="/commandes/archives"
        role="search"
        className={TOOLBAR}
        data-testid="archives-toolbar"
      >
        <ArchiveTabs vue="semaines" />
        <input type="hidden" name="vue" value="semaines" />
        <label className="min-w-44 flex-1 md:min-w-0 md:w-44 md:flex-none">
          <span className="sr-only">Mois</span>
          <MonthField name="mois" defaultValue={month} />
        </label>
        <label className="min-w-36 flex-1 md:min-w-0 md:w-40 md:flex-none">
          <span className="sr-only">District</span>
          <Select
            name="district"
            label="District"
            defaultValue={district || "tous"}
            options={[
              { value: "tous", label: "Tous les districts" },
              { value: "DSO", label: "DSO · Sud-Ouest" },
              { value: "DSE", label: "DSE · Sud-Est" },
              { value: "DCE", label: "DCE · Centre" },
            ]}
          />
        </label>
        <FilterSubmit />
      </FilterForm>
      <div className="flex flex-wrap items-center gap-2" data-testid="month-actions">
        <p className="mr-auto text-small text-fg-muted">
          <span className="font-medium text-fg capitalize">{monthLabelFr(month)}</span>
          {district ? ` · ${district}` : " · tous les districts"} · bons terminés, envoyés ou
          annulés, par date de service.
        </p>
        <Button asChild size="sm" variant="secondary">
          <a
            href={`/api/commandes/archives/mois/${month}/pdf${monthQuery}`}
            download
            data-testid="month-pdf"
          >
            <FileText aria-hidden className="size-4" /> Récap mensuel (PDF)
          </a>
        </Button>
        <BillingLinks period={month} district={district} label="Fichier facturation (Excel)" />
      </div>
      <ArchiveWeeks weeks={weeks} openKey={openKey} pdfFor={pdfs} district={district} />
    </>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("archives:read");
  const sp = await searchParams;
  const admin = isAdmin(user);
  if (sp.vue === "semaines") {
    return (
      <section className="flex min-w-0 flex-col gap-4" aria-label="Récap par semaine">
        <WeeklyRecap sp={sp} user={user} />
      </section>
    );
  }
  if (sp.vue !== "pdf") {
    return (
      <section className="flex min-w-0 flex-col gap-4" aria-label="Bons archivés">
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
      <FilterForm
        action="/commandes/archives"
        role="search"
        className={TOOLBAR}
        data-testid="archives-toolbar"
      >
        <ArchiveTabs vue="pdf" />
        <input type="hidden" name="vue" value="pdf" />
        <ToolbarSearch defaultValue={sp.q ?? ""} placeholder="TC_…, n° de taxi, gare…" />
        <label className="min-w-44 flex-1 md:min-w-0 md:w-40 md:flex-none">
          <span className="sr-only">Type</span>
          <Select
            name="type"
            label="Type"
            defaultValue={sp.type ?? ""}
            options={[
              { value: "", label: "Bus et taxis" },
              { value: "bus", label: "Bus" },
              { value: "taxi", label: "Taxis" },
            ]}
          />
        </label>
        <label className="min-w-44 flex-1 md:min-w-0 md:w-44 md:flex-none">
          <span className="sr-only">Mois</span>
          <MonthField name="mois" defaultValue={sp.mois ?? ""} />
        </label>
        <FilterSubmit />
        {sp.q || sp.type || sp.mois ? <ClearFilters href="/commandes/archives?vue=pdf" /> : null}
      </FilterForm>
      {admin ? <ArchiveAdminBar pending={pendingCount} enabled={archivesEnabled()} /> : null}

      <p className="text-small text-fg-muted" aria-live="polite">
        <span className="font-medium text-fg tabular">{list.total}</span>{" "}
        {pl(list.total, "bon archivé", "bons archivés")}
      </p>

      {list.rows.length === 0 ? (
        <EmptyState
          framed
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
                        <Button asChild size="sm" variant="secondary">
                          <a
                            href={`/api/commandes/archives/${r.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Ouvrir le PDF ${r.reference}`}
                          >
                            <ExternalLink aria-hidden className="size-4" />
                          </a>
                        </Button>
                        <Button asChild size="sm" variant="secondary">
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
              <Button asChild variant="secondary">
                <Link href={keep({ page: String(list.page - 1) })}>Précédente</Link>
              </Button>
            ) : null}
            {list.page < list.totalPages ? (
              <Button asChild variant="secondary">
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
                className="flex min-h-11 items-center gap-3 border border-(--card-frame) bg-surface px-3 py-2 rounded-box shadow-rest"
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
                <Button asChild size="sm" variant="secondary">
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
