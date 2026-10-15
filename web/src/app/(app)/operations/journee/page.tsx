import { FileText } from "lucide-react";
import type { Metadata } from "next";

import { DayTimeline } from "@/components/ops/day-timeline";
import { FilterForm } from "@/components/ui/filter-form";
import { FormAutoSubmit } from "@/components/ui/form-auto-submit";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { DistrictMenu } from "@/components/ui/district-picker";
import { appendDistricts } from "@/lib/district-param";
import { DateField } from "@/components/ui/date-field";
import { addDays, brusselsDay, isValidDay } from "@/lib/orders/time";
import { can } from "@/lib/permissions";
import { requireRoute } from "@/server/auth";
import { handoverDistricts } from "@/server/data/handover";
import { buildTimeline } from "@/server/data/timeline";

import { LiveRefresh } from "../../commandes/live-refresh";

export const metadata: Metadata = { title: "Ma journée · CSM" };

/** Frise « Ma journée » (demande du 10 oct. 2026) : missions PMR, groupes, bus et taxis du jour sur une ligne de temps. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string; district?: string | string[]; gare?: string }>;
}) {
  const user = await requireRoute("/operations/journee");
  const sp = await searchParams;
  const today = brusselsDay();
  const day = isValidDay(sp.jour) ? sp.jour : today;
  const codes = handoverDistricts(user, sp.district);
  // Districts du jour de l'agent (puce « Mes districts » du sélecteur).
  const mine = handoverDistricts(user, undefined);
  const gare = (sp.gare ?? "").trim().slice(0, 60);
  const data = await buildTimeline(user, day, codes, gare);
  return (
    <section className="flex flex-col gap-4" aria-label="Ma journée">
      {/* Barre d'outils sur une ligne en desktop (v4 lot 6) : jour, districts en menu, gare ; PDF et direct à droite. */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterForm
          action="/operations/journee"
          role="search"
          className="flex min-w-0 flex-wrap items-center gap-2 max-md:w-full"
          data-testid="journee-toolbar"
        >
          <FormAutoSubmit />
          <label className="min-w-0 max-md:flex-1 md:w-44">
            <span className="sr-only">Jour</span>
            <DateField
              name="jour"
              defaultValue={day}
              min={addDays(today, -30)}
              max={addDays(today, 30)}
            />
          </label>
          <div className="min-w-0">
            <DistrictMenu
              name="district"
              label="Districts"
              defaultValues={codes}
              emptyValue="tous"
              mine={mine}
              data-testid="district-picker"
            />
          </div>
          <label className="min-w-0 max-md:basis-full md:w-56">
            <span className="sr-only">Gare</span>
            {/* Gares du jour (refonte R2 : plus de datalist) ; saisie libre permise. */}
            <Combobox
              name="gare"
              defaultValue={gare}
              allowFree
              openOnFocus
              options={data.stations.map((s) => ({ value: s, label: s }))}
              placeholder="Toutes les gares"
              maxLength={60}
              listLabel="Gares du jour"
              data-testid="journee-gare"
            />
          </label>
        </FilterForm>
        <div className="flex flex-wrap items-center gap-3 md:ml-auto">
          {gare && can(user, "deplacements:read") ? (
            <Button asChild variant="secondary" size="sm">
              <a
                href={`/api/pmr/feuille-de-route?${appendDistricts(new URLSearchParams({ gare, jour: day }), codes)}`}
                target="_blank"
                rel="noopener"
                data-testid="roadmap-pdf"
              >
                <FileText aria-hidden /> Feuille de route PDF
              </a>
            </Button>
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
