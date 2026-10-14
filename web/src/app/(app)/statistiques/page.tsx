import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { pl } from "@/lib/utils";
import { DateRangePicker } from "@/components/ui/date-field";
import { FilterForm } from "@/components/ui/filter-form";
import { ChipRow, CollapsibleFilters, FilterChip } from "@/components/ui/filters";
import { FormAutoSubmit } from "@/components/ui/form-auto-submit";
import { BarList, StackedBars } from "@/components/ops/charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DistrictPicker } from "@/components/ui/district-picker";
import { Select as CustomSelect } from "@/components/ui/select";
import { appendDistricts, DISTRICT_NAME_OPTIONS } from "@/lib/district-param";
import { StatCard } from "@/components/ui/stat-card";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
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
  return (
    <section className="flex flex-col gap-5" aria-label="Statistiques">
      <div className="flex flex-col gap-2">
        <ChipRow aria-label="Périodes">
          {presets.map((p) => {
            const active = p.du === from && p.au === to;
            return (
              <FilterChip key={p.label} asChild pressed={active}>
                <Link
                  href={`/statistiques?${withKeep({ du: p.du, au: p.au })}`}
                  aria-current={active ? "true" : undefined}
                >
                  {p.label}
                </Link>
              </FilterChip>
            );
          })}
        </ChipRow>
        <FilterForm
          action="/statistiques"
          className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-end"
        >
          <FormAutoSubmit />
          <CollapsibleFilters
            active={
              [filters.district.length ? "d" : "", filters.type, filters.societe].filter(Boolean)
                .length
            }
          >
            <DateRangePicker
              nameFrom="du"
              nameTo="au"
              defaultFrom={from ?? ""}
              defaultTo={to ?? ""}
              presets={["last7", "week"]}
              fieldClassName="md:w-40"
            />
            <div className="col-span-2 flex min-w-0 flex-col gap-1 md:w-auto">
              <span className="text-small text-fg-muted">District</span>
              <DistrictPicker
                name="district"
                label="District"
                options={DISTRICT_NAME_OPTIONS}
                defaultValues={filters.district}
              />
            </div>
            <label className="flex min-w-0 flex-col gap-1 md:w-32">
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
            <label className="col-span-2 flex min-w-0 flex-col gap-1 md:w-56">
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
            <Button type="submit">Appliquer</Button>
          </CollapsibleFilters>
          <Button asChild variant="ghost" className="border border-border md:ml-auto">
            <a href={csv} download>
              <Download aria-hidden /> CSV
            </a>
          </Button>
        </FilterForm>
        <p className="text-small text-fg-muted">
          Du {formatDay(from)} au {formatDay(to)} · district de la commande
          {filters.type || filters.societe ? " · taxis exclus (filtre bus)" : ""}
        </p>
      </div>

      <div
        className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6"
        data-testid="stats-cards"
      >
        <StatCard label="Commandes bus" value={t.bus} tone="accent" />
        <StatCard label="Bus mobilisés" value={t.buses} />
        <StatCard label="Taxis" value={t.taxi} tone="info" />
        {t.medianConfirm !== null ? (
          <StatCard
            label="Confirmation (médiane, min)"
            value={Math.round(t.medianConfirm)}
            hint={fmtMin(t.medianConfirm)}
          />
        ) : null}
        <StatCard
          label="Annulations (%)"
          value={Math.round(t.cancelRate * 100)}
          tone={t.cancelRate > 0.1 ? "warn" : "neutral"}
          hint={`${t.cancelled} ${pl(t.cancelled, "annulée")}`}
        />
        {t.assists !== null ? (
          <StatCard label="Prestations PMR" value={t.assists} tone="ok" />
        ) : null}
      </div>

      <Card>
        <CardHeader title={`Volume par ${stats.granularity}`} />
        <CardContent>
          <StackedBars series={stats.series} caption={`Commandes par ${stats.granularity}`} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={`Par type C3`} />
          <CardContent>
            <BarList items={stats.byType} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={`Par district`} />
          <CardContent>
            <BarList items={stats.byDistrict} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={`Motifs les plus fréquents`} />
          <CardContent>
            <BarList items={stats.byReason} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={`Lignes desservies`} />
          <CardContent>
            <BarList items={stats.byLine} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader title={`Fournisseurs`} />
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
              <li key={s.name} className="flex flex-col border border-border px-3 py-2">
                <span className="text-body font-medium">{s.name}</span>
                <span className="text-small text-fg-muted">
                  {s.orders} {pl(s.orders, "commande")} · {s.buses} bus · {s.cancelled}{" "}
                  {pl(s.cancelled, "annulée")} · confirmation {fmtMin(s.medianConfirm)}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={`Trajets les plus commandés`} />
          <CardContent>
            <BarList items={stats.routes} />
          </CardContent>
        </Card>
        {stats.pmr ? (
          <Card>
            <CardHeader title={`Prestations PMR par gare`} />
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
