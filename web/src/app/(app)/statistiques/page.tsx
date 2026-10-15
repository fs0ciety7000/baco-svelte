import { Download } from "lucide-react";
import type { Metadata } from "next";

import { pl } from "@/lib/utils";
import { DateRangePicker } from "@/components/ui/date-field";
import { FilterForm } from "@/components/ui/filter-form";
import {
  ClearFilters,
  CollapsibleFilters,
  FilterSubmit,
  SegmentedNav,
} from "@/components/ui/filters";
import { BarList, StackedBars } from "@/components/ops/charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DistrictMenu } from "@/components/ui/district-picker";
import { Select as CustomSelect } from "@/components/ui/select";
import { appendDistricts, DISTRICT_NAME_OPTIONS } from "@/lib/district-param";
import { Stat, StatStrip } from "@/components/ui/stat-card";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { addDays, brusselsDay, formatDay } from "@/lib/orders/time";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { loadStats, type StatsFilters } from "@/server/data/stats";

export const metadata: Metadata = { title: "Statistiques · CSM" };

const fmtMin = (m: number | null) =>
  m === null
    ? "—"
    : m < 60
      ? `${Math.round(m)} min`
      : `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")}`;

export default async function Page({ searchParams }: { searchParams: Promise<StatsFilters> }) {
  const user = await requirePermission("stats:read");
  const sp = await searchParams;
  const { from, to, filters, stats, companies } = await loadStats(sp, {
    canTaxi: can(user, "taxi:read"),
    canPmr: can(user, "deplacements:read"),
  });
  const today = brusselsDay();
  const keep = Object.fromEntries(
    Object.entries({
      type: filters.type,
      societe: filters.societe,
    }).filter(([, v]) => v),
  ) as Record<string, string>;
  // Districts répétés (`?district=Sud-Ouest&district=Centre`).
  const withKeep = (extra: Record<string, string>) =>
    appendDistricts(new URLSearchParams({ ...keep, ...extra }), filters.district).toString();
  const presets = [
    { label: "7 jours", du: addDays(today, -6), au: today },
    { label: "30 jours", du: addDays(today, -29), au: today },
    { label: "Ce mois", du: `${today.slice(0, 7)}-01`, au: today },
    { label: "Cette année", du: `${today.slice(0, 4)}-01-01`, au: today },
  ];
  const t = stats.totals;
  const csv = `/api/operations/statistiques/export?${withKeep({ du: from, au: to })}`;
  // Filtres repliés actifs : type, société, période libre (hors raccourcis).
  const customPeriod = !presets.some((p) => p.du === from && p.au === to);
  const folded = [filters.type, filters.societe].filter(Boolean).length + Number(customPeriod);
  return (
    <section className="flex flex-col gap-4" aria-label="Statistiques">
      {/* Barre d'outils sur une ligne en desktop (v4 lot 6) : période, districts, « Filtres (n) », export à droite. */}
      <div className="flex flex-col gap-2">
        <FilterForm
          action="/statistiques"
          role="search"
          className="flex flex-wrap items-center gap-2"
          data-testid="stats-toolbar"
        >
          <SegmentedNav
            label="Période"
            items={presets.map((p) => ({
              label: p.label,
              href: `/statistiques?${withKeep({ du: p.du, au: p.au })}`,
              current: p.du === from && p.au === to,
            }))}
          />
          <div className="min-w-0">
            <DistrictMenu
              name="district"
              label="Districts"
              options={DISTRICT_NAME_OPTIONS}
              defaultValues={filters.district}
            />
          </div>
          <CollapsibleFilters always active={folded}>
            <DateRangePicker
              nameFrom="du"
              nameTo="au"
              defaultFrom={from ?? ""}
              defaultTo={to ?? ""}
              presets={["last7", "week"]}
              fieldClassName="md:w-40"
            />
            <label className="flex min-w-0 flex-col gap-1 max-md:basis-full md:w-32">
              <span className="text-small text-fg-muted">Type C3</span>
              <CustomSelect
                name="type"
                defaultValue={filters.type ?? ""}
                options={[
                  { value: "", label: "Tous" },
                  { value: "1", label: "Type 1" },
                  { value: "2", label: "Type 2" },
                  { value: "3", label: "Type 3" },
                ]}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 max-md:basis-full md:w-56">
              <span className="text-small text-fg-muted">Société de bus</span>
              {/* Liste longue : recherche (refonte R2) ; vide = toutes. */}
              <Combobox
                name="societe"
                defaultValue={filters.societe ?? ""}
                options={companies.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="Toutes"
                emptyText="Aucune société"
              />
            </label>
            <ClearFilters href="/statistiques" />
          </CollapsibleFilters>
          <Button asChild variant="secondary" size="sm" className="ml-auto">
            <a href={csv} download>
              <Download aria-hidden /> Export CSV
            </a>
          </Button>
          <FilterSubmit />
        </FilterForm>
        <p className="text-small text-fg-muted">
          Du <span className="tabular">{formatDay(from)}</span> au{" "}
          <span className="tabular">{formatDay(to)}</span> · district de la commande
          {filters.type || filters.societe ? " · taxis exclus (filtre bus)" : ""}
        </p>
      </div>

      <StatStrip data-testid="stats-cards">
        <Stat label="Commandes bus" value={t.bus} tone="info" />
        <Stat label="Bus mobilisés" value={t.buses} />
        <Stat label="Taxis" value={t.taxi} tone="info" />
        {t.medianConfirm !== null ? (
          <Stat
            label="Confirmation (médiane, min)"
            value={Math.round(t.medianConfirm)}
            hint={fmtMin(t.medianConfirm)}
          />
        ) : null}
        <Stat
          label="Annulations (%)"
          value={Math.round(t.cancelRate * 100)}
          tone={t.cancelRate > 0.1 ? "warn" : undefined}
          hint={`${t.cancelled} ${pl(t.cancelled, "annulée")}`}
        />
        {t.assists !== null ? <Stat label="Prestations PMR" value={t.assists} tone="ok" /> : null}
      </StatStrip>

      <Card>
        <CardHeader title={`Volume par ${stats.granularity}`} />
        <CardContent>
          <StackedBars series={stats.series} caption={`Commandes par ${stats.granularity}`} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Par type C3" />
          <CardContent>
            <BarList items={stats.byType} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Par district" />
          <CardContent>
            <BarList items={stats.byDistrict} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Motifs les plus fréquents" />
          <CardContent>
            <BarList items={stats.byReason} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Lignes desservies" />
          <CardContent>
            <BarList items={stats.byLine} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader title="Fournisseurs" count={stats.suppliers.length} />
        <CardContent className="flex flex-col gap-2">
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <Th>Société</Th>
                  <Th numeric>Commandes</Th>
                  <Th numeric>Bus</Th>
                  <Th numeric>Annulées</Th>
                  <Th numeric>Confirmation (médiane)</Th>
                </tr>
              </THead>
              <tbody data-testid="stats-suppliers">
                {stats.suppliers.map((s) => (
                  <Tr key={s.name}>
                    <Td>{s.name}</Td>
                    <Td numeric>{s.orders}</Td>
                    <Td numeric>{s.buses}</Td>
                    <Td numeric>{s.cancelled}</Td>
                    <Td numeric>{fmtMin(s.medianConfirm)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden">
            {stats.suppliers.map((s) => (
              <li key={s.name}>
                <ListCard
                  title={s.name}
                  meta={
                    <span className="tabular">
                      {s.orders} {pl(s.orders, "commande")} · {s.buses} bus · {s.cancelled}{" "}
                      {pl(s.cancelled, "annulée")} · confirmation {fmtMin(s.medianConfirm)}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Trajets les plus commandés" />
          <CardContent>
            <BarList items={stats.routes} />
          </CardContent>
        </Card>
        {stats.pmr ? (
          <Card>
            <CardHeader title="Prestations PMR par gare" />
            <CardContent className="flex flex-col gap-4">
              <BarList items={stats.pmr.byStation} />
              <BarList
                items={stats.pmr.byType.map((x) => ({
                  label: x.label === "—" ? "Type non précisé" : `Type ${x.label}`,
                  value: x.value,
                }))}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
