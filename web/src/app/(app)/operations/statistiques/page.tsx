import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BarList, StackedBars } from "@/components/ops/charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
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
      district: filters.district,
      type: filters.type,
      societe: filters.societe,
    }).filter(([, v]) => v),
  ) as Record<string, string>;
  const presets = [
    { label: "7 jours", du: addDays(today, -6), au: today },
    { label: "30 jours", du: addDays(today, -29), au: today },
    { label: "Ce mois", du: `${today.slice(0, 7)}-01`, au: today },
    { label: "Cette année", du: `${today.slice(0, 4)}-01-01`, au: today },
  ];
  const t = stats.totals;
  const csv = `/api/operations/statistiques/export?${new URLSearchParams({ ...keep, du: from, au: to })}`;
  return (
    <section className="flex flex-col gap-5" aria-label="Statistiques">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2" aria-label="Périodes">
          {presets.map((p) => {
            const active = p.du === from && p.au === to;
            return (
              <Button
                key={p.label}
                asChild
                size="sm"
                variant={active ? "primary" : "ghost"}
                className={active ? "" : "border border-border"}
              >
                <Link
                  href={`/operations/statistiques?${new URLSearchParams({ ...keep, du: p.du, au: p.au })}`}
                  aria-current={active ? "true" : undefined}
                >
                  {p.label}
                </Link>
              </Button>
            );
          })}
        </div>
        <form
          action="/operations/statistiques"
          method="get"
          className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-end"
        >
          <label className="flex min-w-0 flex-col gap-1 md:w-40">
            <span className="text-small text-fg-muted">Du</span>
            <Input type="date" name="du" defaultValue={from} />
          </label>
          <label className="flex min-w-0 flex-col gap-1 md:w-40">
            <span className="text-small text-fg-muted">Au</span>
            <Input type="date" name="au" defaultValue={to} />
          </label>
          <label className="flex min-w-0 flex-col gap-1 md:w-36">
            <span className="text-small text-fg-muted">District</span>
            <Select name="district" defaultValue={filters.district ?? ""}>
              <option value="">Tous</option>
              <option>Sud-Ouest</option>
              <option>Sud-Est</option>
              <option>Centre</option>
            </Select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 md:w-32">
            <span className="text-small text-fg-muted">Type C3</span>
            <Select name="type" defaultValue={filters.type ?? ""}>
              <option value="">Tous</option>
              <option value="1">Type 1</option>
              <option value="2">Type 2</option>
              <option value="3">Type 3</option>
            </Select>
          </label>
          <label className="col-span-2 flex min-w-0 flex-col gap-1 md:w-56">
            <span className="text-small text-fg-muted">Société de bus</span>
            <Select name="societe" defaultValue={filters.societe ?? ""}>
              <option value="">Toutes</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
          <Button type="submit">Appliquer</Button>
          <Button asChild variant="ghost" className="border border-border md:ml-auto">
            <a href={csv} download>
              <Download aria-hidden /> CSV
            </a>
          </Button>
        </form>
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
          hint={`${t.cancelled} annulée(s)`}
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
                  {s.orders} commande(s) · {s.buses} bus · {s.cancelled} annulée(s) · confirmation{" "}
                  {fmtMin(s.medianConfirm)}
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
