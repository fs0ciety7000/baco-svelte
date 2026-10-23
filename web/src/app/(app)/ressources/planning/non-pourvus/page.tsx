import { FileDown, FileSpreadsheet, FileText } from "lucide-react";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { FilterForm } from "@/components/ui/filter-form";
import { FormAutoSubmit } from "@/components/ui/form-auto-submit";
import { ListCount, ListStatus, TOOLBAR } from "@/components/ui/list-toolbar";
import { EmptyState } from "@/components/ui/misc";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select } from "@/components/ui/select";
import { Stat, StatStrip } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/status-badge";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { brusselsDay, formatShortDay } from "@/lib/orders/time";
import {
  FUNCTION_LABEL,
  KIND_LABEL,
  MONTH_NAMES,
  OPEN_FUNCTIONS,
  OPEN_SERVICES,
  openFilterQuery,
  openKindsFor,
  openPeriodLabel,
  parseOpenFilter,
} from "@/lib/quinyx/model";
import { openTotals, weekday } from "@/lib/quinyx/open-export";
import { pl } from "@/lib/utils";
import { requireRoute } from "@/server/auth";
import { listOpenShifts, openZones } from "@/server/data/quinyx-open";

export const metadata: Metadata = { title: "Services non pourvus · Planning · CSM" };

// Services PACO / RCCA publiés dans Quinyx sans agent affecté (23 oct. 2026) : OCC Mons et OCC Namur (groupes Quinyx
// « équipe »). Droit `quinyx_open:read` (admin / sysop par défaut). Exports CSV / Excel / PDF par la route
// `/api/equipe/quinyx/non-pourvus`.

type SP = Record<string, string | string[] | undefined>;

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireRoute("/ressources/planning/non-pourvus");
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(raw))
    for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) params.append(k, x);
  const today = brusselsDay();
  const filter = parseOpenFilter(params, today);
  const zones = await openZones();
  const shifts = await listOpenShifts(filter, zones);
  const totals = openTotals(shifts);
  const query = openFilterQuery(filter);
  const exportHref = (format: string) => `/api/equipe/quinyx/non-pourvus?${query}&format=${format}`;
  const thisYear = Number(today.slice(0, 4));
  const years = [thisYear + 1, thisYear, thisYear - 1, thisYear - 2].filter(
    (y) => y >= 2026 || y === filter.year,
  );
  // Prestations qui existent : PACO AM / PM / Nuit, RCCA AM / PM (pas de RCCA de nuit, précision du 23 oct. 2026).
  const services = OPEN_SERVICES.filter(
    (sv) =>
      (!filter.functions.length || filter.functions.includes(sv.function)) &&
      (!filter.kinds.length || filter.kinds.includes(sv.kind)),
  );
  const count = (fn: string, kind: string) =>
    shifts.filter((s) => s.function === fn && s.kind === kind).length;
  const kindOptions = openKindsFor(filter.functions);

  return (
    <section className="flex flex-col gap-4" aria-label="Services non pourvus">
      <FilterForm
        action="/ressources/planning/non-pourvus"
        className={TOOLBAR}
        data-testid="open-toolbar"
      >
        <FormAutoSubmit />
        <label className="w-36">
          <span className="sr-only">Mois</span>
          <Select
            name="mois"
            label="Mois"
            defaultValue={String(filter.month)}
            options={[
              { value: "0", label: "Toute l'année" },
              ...MONTH_NAMES.map((m, i) => ({
                value: String(i + 1),
                label: m.charAt(0).toUpperCase() + m.slice(1),
              })),
            ]}
            data-testid="open-month"
          />
        </label>
        <label className="w-28">
          <span className="sr-only">Année</span>
          <Select
            name="annee"
            label="Année"
            defaultValue={String(filter.year)}
            options={[...new Set([...years, filter.year])]
              .sort((a, b) => b - a)
              .map((y) => ({ value: String(y), label: String(y) }))}
            data-testid="open-year"
          />
        </label>
        <label className="min-w-44 flex-1 md:w-52 md:flex-none">
          <span className="sr-only">Zone</span>
          <MultiSelect
            name="zone"
            label="Zone"
            options={zones.map((z) => ({ value: z.groupId, label: z.label, hint: z.district }))}
            defaultValues={filter.groups}
            allLabel="Toutes les zones"
            noun="zone"
            data-testid="open-zone"
          />
        </label>
        <label className="w-40">
          <span className="sr-only">Fonction</span>
          <MultiSelect
            name="fonction"
            label="Fonction"
            options={OPEN_FUNCTIONS.map((f) => ({ value: f, label: FUNCTION_LABEL[f] }))}
            defaultValues={filter.functions}
            allLabel="PACO et RCCA"
            noun="fonction"
            data-testid="open-function"
          />
        </label>
        <label className="w-40">
          <span className="sr-only">Service</span>
          <MultiSelect
            name="type"
            label="Service"
            options={kindOptions.map((k) => ({
              value: k,
              label: KIND_LABEL[k],
              hint: k === "nuit" ? "PACO seulement" : undefined,
            }))}
            defaultValues={filter.kinds.filter((k) => kindOptions.includes(k))}
            allLabel={kindOptions.includes("nuit") ? "AM, PM et Nuit" : "AM et PM"}
            noun="service"
            data-testid="open-kind"
          />
        </label>
        <button type="submit" tabIndex={-1} aria-hidden className="sr-only">
          Afficher
        </button>
        <span className="flex gap-2 md:ml-auto">
          <Button asChild variant="secondary" size="sm">
            <a href={exportHref("xlsx")} download data-testid="open-export-xlsx">
              <FileSpreadsheet aria-hidden />
              Excel
            </a>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <a href={exportHref("pdf")} download data-testid="open-export-pdf">
              <FileText aria-hidden />
              PDF
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href={exportHref("csv")} download data-testid="open-export-csv">
              <FileDown aria-hidden />
              CSV
            </a>
          </Button>
        </span>
      </FilterForm>

      <StatStrip aria-label={`Services non pourvus, ${openPeriodLabel(filter)}`}>
        <Stat label="Non pourvus" value={totals.total} tone={totals.total ? "warn" : "neutral"} />
        {services.map((sv) => (
          <Stat
            key={`${sv.function}-${sv.kind}`}
            label={`${FUNCTION_LABEL[sv.function]} ${KIND_LABEL[sv.kind]}`}
            value={count(sv.function, sv.kind)}
          />
        ))}
      </StatStrip>

      <ListStatus
        count={
          <ListCount
            n={shifts.length}
            label={pl(shifts.length, "service non pourvu", "services non pourvus")}
            extra={<span className="text-fg-muted"> · {openPeriodLabel(filter)}</span>}
          />
        }
      />

      {!shifts.length ? (
        <EmptyState
          framed
          title="Aucun service non pourvu"
          description={
            zones.length
              ? "Rien pour ces filtres. Les services non pourvus arrivent avec la synchro Quinyx de l'extension CSM (1.11.0 ou plus)."
              : "Aucun groupe Quinyx lisible : vérifie les groupes dans Administration › Quinyx."
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table data-testid="open-table">
              <THead>
                <tr>
                  <Th>Date</Th>
                  <Th>Zone</Th>
                  <Th>Fonction</Th>
                  <Th>Service</Th>
                  <Th>Horaire</Th>
                  <Th>Type Quinyx</Th>
                </tr>
              </THead>
              <tbody>
                {shifts.map((s) => (
                  <Tr key={s.id} data-testid="open-row">
                    <Td className="whitespace-nowrap">
                      <span className="font-mono tabular">{formatShortDay(s.day)}</span>{" "}
                      <span className="text-small text-fg-muted">{weekday(s.day)}</span>
                    </Td>
                    <Td>
                      {s.zone}
                      {s.district ? (
                        <span className="text-small text-fg-muted"> · {s.district}</span>
                      ) : null}
                    </Td>
                    <Td>
                      <Badge tone={s.function === "rcca" ? "info" : "neutral"}>
                        {FUNCTION_LABEL[s.function]}
                      </Badge>
                    </Td>
                    <Td>{KIND_LABEL[s.kind]}</Td>
                    <Td className="font-mono whitespace-nowrap tabular">
                      {s.from} – {s.to}
                    </Td>
                    <Td className="text-small text-fg-muted">
                      {s.code}
                      {s.section ? ` · ${s.section}` : ""}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden" data-testid="open-cards">
            {shifts.map((s) => (
              <li key={s.id}>
                <ListCard
                  statusColor={s.function === "rcca" ? "var(--info)" : "var(--border-strong)"}
                  title={
                    <>
                      <span className="font-mono tabular">{formatShortDay(s.day)}</span>{" "}
                      <span className="text-small text-fg-muted">{weekday(s.day)}</span>
                    </>
                  }
                  meta={[`${s.from} – ${s.to}`, s.zone, s.district, s.code]
                    .filter(Boolean)
                    .join(" · ")}
                  aside={
                    <Badge tone={s.function === "rcca" ? "info" : "neutral"}>
                      {FUNCTION_LABEL[s.function]} {KIND_LABEL[s.kind]}
                    </Badge>
                  }
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
