import { FileText } from "lucide-react";
import type { Metadata } from "next";

import { DayTimeline } from "@/components/ops/day-timeline";
import { FilterForm } from "@/components/ui/filter-form";
import { FormAutoSubmit } from "@/components/ui/form-auto-submit";
import { Input, Select } from "@/components/ui/input";
import { addDays, brusselsDay, isValidDay } from "@/lib/orders/time";
import { can } from "@/lib/permissions";
import { requireRoute } from "@/server/auth";
import { HANDOVER_CODES, handoverDistricts } from "@/server/data/handover";
import { buildTimeline } from "@/server/data/timeline";

import { LiveRefresh } from "../../commandes/live-refresh";

export const metadata: Metadata = { title: "Ma journée · CSM" };

/** Frise « Ma journée » (demande du 10 oct. 2026) : missions PMR, groupes, bus et taxis du jour sur une ligne de temps. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string; district?: string; gare?: string }>;
}) {
  const user = await requireRoute("/operations/journee");
  const sp = await searchParams;
  const today = brusselsDay();
  const day = isValidDay(sp.jour) ? sp.jour : today;
  const codes = handoverDistricts(user, sp.district);
  const gare = (sp.gare ?? "").trim().slice(0, 60);
  const data = await buildTimeline(user, day, codes, gare);
  return (
    <section className="flex flex-col gap-4" aria-label="Ma journée">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <FilterForm
          action="/operations/journee"
          role="search"
          className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto md:flex-wrap md:items-end"
        >
          <FormAutoSubmit />
          <label className="flex min-w-0 flex-col gap-1 md:w-44">
            <span className="text-small text-fg-muted">Jour</span>
            <Input
              type="date"
              name="jour"
              defaultValue={day}
              min={addDays(today, -30)}
              max={addDays(today, 30)}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 md:w-40">
            <span className="text-small text-fg-muted">District</span>
            <Select name="district" defaultValue={sp.district ?? ""}>
              <option value="">
                Mes districts{codes.length && !sp.district ? ` (${codes.join(", ")})` : ""}
              </option>
              {HANDOVER_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="tous">Tous</option>
            </Select>
          </label>
          <label className="col-span-2 flex min-w-0 flex-col gap-1 md:w-56">
            <span className="text-small text-fg-muted">Gare</span>
            <Input
              name="gare"
              defaultValue={gare}
              list="journee-gares"
              placeholder="Toutes les gares"
              maxLength={60}
              autoComplete="off"
            />
            <datalist id="journee-gares">
              {data.stations.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
        </FilterForm>
        <div className="flex flex-wrap items-center gap-3">
          {gare && can(user, "deplacements:read") ? (
            <a
              href={`/api/pmr/feuille-de-route?${new URLSearchParams({ gare, jour: day, district: codes[0] ?? "" })}`}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-strong px-3 text-body hover:bg-surface-2"
              data-testid="roadmap-pdf"
            >
              <FileText aria-hidden className="size-4" /> Feuille de route PDF
            </a>
          ) : can(user, "deplacements:read") ? (
            <span className="text-small text-fg-muted">
              Choisis une gare pour sa feuille de route PDF.
            </span>
          ) : null}
          <LiveRefresh
            topics={[
              "bus_orders",
              "taxi_orders",
              "pmr_assists",
              "group_missions",
              "mission_trains",
            ]}
          />
        </div>
      </div>
      <DayTimeline
        data={data}
        isToday={day === today}
        context={`${day}|${codes.join(",")}|${gare}`}
      />
    </section>
  );
}
