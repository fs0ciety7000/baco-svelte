import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { DistrictMenu } from "@/components/ui/district-picker";
import { TOOLBAR } from "@/components/ui/list-toolbar";
import { appendDistricts, DISTRICT_CODE_OPTIONS, parseDistricts } from "@/lib/district-param";
import Link from "next/link";

import { PlanningDay, PlanningWeek, QuinyxFreshness } from "@/components/team/planning";
import { FilterChip, SegmentedNav } from "@/components/ui/filters";
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
      {/* Barre d'outils sur une ligne (v4 lot 6) : vue, jour, districts en menu. */}
      <FilterForm action="/ressources/planning" className={TOOLBAR} data-testid="planning-toolbar">
        <SegmentedNav
          label="Vue"
          items={[
            { label: "Jour", href: href({ vue: "" }), current: !week },
            {
              label: "Semaine",
              href: href({ vue: "semaine" }),
              current: week,
              testId: "planning-week",
            },
          ]}
        />
        {week ? <input type="hidden" name="vue" value="semaine" /> : null}
        <label className="min-w-44 flex-1 md:min-w-0 md:w-44 md:flex-none">
          <span className="sr-only">Jour</span>
          <DateField name="jour" defaultValue={day} />
        </label>
        {day !== today ? (
          <FilterChip asChild>
            <Link href={href({ jour: "" })}>Aujourd&apos;hui</Link>
          </FilterChip>
        ) : null}
        <div className="min-w-0">
          <DistrictMenu
            name="district"
            label="Districts"
            options={PLANNING_DISTRICTS}
            defaultValues={districts}
          />
        </div>
        <FormAutoSubmit />
      </FilterForm>
      <nav className="flex items-center justify-between gap-2" aria-label="Période">
        <Button asChild variant="secondary" size="sm">
          <Link
            href={href({ jour: addDays(day, -step) })}
            aria-label={week ? "Semaine précédente" : "Jour précédent"}
          >
            <ChevronLeft aria-hidden />
            <span className="hidden sm:inline">{week ? "Semaine précédente" : "Veille"}</span>
          </Link>
        </Button>
        <h2
          className="text-center text-h3 font-semibold first-letter:uppercase"
          data-testid="planning-title"
        >
          {week ? `Semaine du ${formatLongDay(days[0]!)}` : formatLongDay(day)}
        </h2>
        <Button asChild variant="secondary" size="sm">
          <Link
            href={href({ jour: addDays(day, step) })}
            aria-label={week ? "Semaine suivante" : "Lendemain"}
          >
            <span className="hidden sm:inline">{week ? "Semaine suivante" : "Lendemain"}</span>
            <ChevronRight aria-hidden />
          </Link>
        </Button>
      </nav>
      {week ? (
        <PlanningWeek shifts={shifts} days={days} today={today} meId={user.id} />
      ) : (
        <PlanningDay shifts={shifts} day={day} isToday={day === today} meId={user.id} />
      )}
    </section>
  );
}
