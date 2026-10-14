import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";

import { DistrictPicker } from "@/components/ui/district-picker";
import { appendDistricts, DISTRICT_CODE_OPTIONS, parseDistricts } from "@/lib/district-param";
import Link from "next/link";

import { PlanningDay, PlanningWeek, QuinyxFreshness } from "@/components/team/planning";
import { ChipRow, FilterChip } from "@/components/ui/filters";
import { FilterForm } from "@/components/ui/filter-form";
import { FormAutoSubmit } from "@/components/ui/form-auto-submit";
import { DateField } from "@/components/ui/date-field";
import { addDays, brusselsDay, formatLongDay, isValidDay } from "@/lib/orders/time";
import { QUINYX_DISTRICTS, weekDays } from "@/lib/quinyx/model";
import { requireRoute } from "@/server/auth";
import { listPlanning, quinyxSyncs } from "@/server/data/quinyx";

export const metadata: Metadata = { title: "Planning · Équipe · CSM" };

// Districts Quinyx : les trois de l'équipe et les deux du nord (DNO, DNE).
const PLANNING_DISTRICTS = [
  ...DISTRICT_CODE_OPTIONS,
  { value: "DNO", label: "DNO", hint: "Nord-Ouest" },
  { value: "DNE", label: "DNE", hint: "Nord-Est" },
];

type SP = { vue?: string; jour?: string; district?: string | string[] };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireRoute("/ressources/planning");
  const f = await searchParams;
  const today = brusselsDay();
  const day = isValidDay(f.jour) ? f.jour : today;
  const week = f.vue === "semaine";
  // Un ou plusieurs districts (paramètre répété ou « DSO,DSE ») ; vide = tous.
  const districts = parseDistricts(f.district, QUINYX_DISTRICTS);
  const days = weekDays(day);
  const [shifts, syncs] = await Promise.all([
    // Vue du jour : la nuit de la veille est lue aussi (elle finit le matin).
    week
      ? listPlanning(days[0]!, days[6]!, districts)
      : listPlanning(addDays(day, -1), day, districts),
    quinyxSyncs().catch(() => []),
  ]);
  const href = (p: { vue?: string; jour?: string }) => {
    const q = new URLSearchParams();
    const v = { vue: week ? "semaine" : "", jour: day === today ? "" : day, ...p };
    for (const [k, val] of Object.entries(v)) if (val) q.set(k, val);
    appendDistricts(q, districts);
    const s = q.toString();
    return `/ressources/planning${s ? `?${s}` : ""}`;
  };
  const step = week ? 7 : 1;
  return (
    <section className="flex flex-col gap-4" aria-label="Planning de l'équipe">
      <QuinyxFreshness syncs={syncs} />
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <ChipRow aria-label="Vue">
          <FilterChip asChild pressed={!week}>
            <Link href={href({ vue: "" })}>Jour</Link>
          </FilterChip>
          <FilterChip asChild pressed={week}>
            <Link href={href({ vue: "semaine" })} data-testid="planning-week">
              Semaine
            </Link>
          </FilterChip>
          {day !== today ? (
            <FilterChip asChild>
              <Link href={href({ jour: "" })}>Aujourd&apos;hui</Link>
            </FilterChip>
          ) : null}
        </ChipRow>
        <FilterForm
          action="/ressources/planning"
          className="grid grid-cols-2 gap-2 md:flex md:items-end"
        >
          {week ? <input type="hidden" name="vue" value="semaine" /> : null}
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-small text-fg-muted">Jour</span>
            <DateField name="jour" defaultValue={day} />
          </label>
          <div className="col-span-2 flex min-w-0 flex-col gap-1 md:col-span-1">
            <span className="text-small text-fg-muted">District</span>
            <DistrictPicker
              name="district"
              label="District"
              options={PLANNING_DISTRICTS}
              defaultValues={districts}
              showHint="never"
            />
          </div>
          <FormAutoSubmit />
        </FilterForm>
      </div>
      <nav className="flex items-center justify-between gap-2" aria-label="Période">
        <Link
          href={href({ jour: addDays(day, -step) })}
          className="inline-flex h-control items-center gap-1 rounded-control border border-border px-3 text-small hover:border-border-strong"
          aria-label={week ? "Semaine précédente" : "Jour précédent"}
        >
          <ChevronLeft aria-hidden className="size-4" />
          <span className="hidden sm:inline">{week ? "Semaine précédente" : "Veille"}</span>
        </Link>
        <h2
          className="text-center text-h3 font-semibold first-letter:uppercase"
          data-testid="planning-title"
        >
          {week ? `Semaine du ${formatLongDay(days[0]!)}` : formatLongDay(day)}
        </h2>
        <Link
          href={href({ jour: addDays(day, step) })}
          className="inline-flex h-control items-center gap-1 rounded-control border border-border px-3 text-small hover:border-border-strong"
          aria-label={week ? "Semaine suivante" : "Lendemain"}
        >
          <span className="hidden sm:inline">{week ? "Semaine suivante" : "Lendemain"}</span>
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      </nav>
      {week ? (
        <PlanningWeek shifts={shifts} days={days} today={today} meId={user.id} />
      ) : (
        <PlanningDay shifts={shifts} day={day} isToday={day === today} meId={user.id} />
      )}
    </section>
  );
}
