import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PlannerScreen } from "@/components/planner/planner-screen";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { DistrictMenu } from "@/components/ui/district-picker";
import { FilterForm } from "@/components/ui/filter-form";
import { FormAutoSubmit } from "@/components/ui/form-auto-submit";
import { ToolbarSearch } from "@/components/ui/list-toolbar";
import { appendDistricts } from "@/lib/district-param";
import { addDays, brusselsDay, isValidDay } from "@/lib/orders/time";
import { can } from "@/lib/permissions";
import { requireRoute } from "@/server/auth";
import { handoverDistricts } from "@/server/data/handover";
import { plannerDay, plannerStationRefs } from "@/server/data/planner";

export const metadata: Metadata = { title: "Planificateur · CSM" };

// PMR › Planificateur, vue Jour (lot P1, 15 oct. 2026, docs/design/CADRAGE-PLANIFICATEUR-PMR.md) : agents de gare
// (Quinyx, groupes « gares ») en rangées, prises en charge DICOS et saisies à attribuer, glisser-déposer contrôlé par le
// moteur pur (`lib/planner/`). Données : `plannerDay` ; écritures : ./actions.ts ; écran : components/planner/.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    jour?: string;
    district?: string | string[];
    q?: string;
    tache?: string;
  }>;
}) {
  // Garde dans la page (pas seulement le layout) : Next rend layout et page en parallèle.
  const user = await requireRoute("/pmr/planificateur");
  const sp = await searchParams;
  const today = brusselsDay();
  const day = isValidDay(sp.jour) ? sp.jour : today;
  const codes = handoverDistricts(user, sp.district);
  const mine = handoverDistricts(user, undefined);
  const q = (sp.q ?? "").trim().slice(0, 60);
  const [data, stations] = await Promise.all([plannerDay(day, codes), plannerStationRefs()]);
  const link = (d: string) => {
    const p = new URLSearchParams({ jour: d });
    if (q) p.set("q", q);
    if (sp.district !== undefined) appendDistricts(p, codes.length ? codes : ["tous"]);
    return `/pmr/planificateur?${p}`;
  };
  const filters = (
    <FilterForm
      action="/pmr/planificateur"
      role="search"
      className="flex min-w-0 flex-wrap items-center gap-2 max-md:w-full"
      data-testid="planner-filters"
    >
      <FormAutoSubmit live />
      <div className="flex min-w-0 items-center gap-1 max-md:w-full">
        <Button asChild variant="secondary" size="icon">
          <Link
            href={link(addDays(day, -1))}
            aria-label="Jour précédent"
            data-testid="planner-prev"
          >
            <ChevronLeft aria-hidden />
          </Link>
        </Button>
        <label className="min-w-0 max-md:flex-1 md:w-40">
          <span className="sr-only">Jour</span>
          <DateField
            name="jour"
            defaultValue={day}
            min={addDays(today, -60)}
            max={addDays(today, 60)}
          />
        </label>
        <Button asChild variant="secondary" size="icon">
          <Link href={link(addDays(day, 1))} aria-label="Jour suivant" data-testid="planner-next">
            <ChevronRight aria-hidden />
          </Link>
        </Button>
        {day !== today ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={link(today)}>Aujourd&apos;hui</Link>
          </Button>
        ) : null}
      </div>
      {/* Vues : Jour (lot P1) ; Semaine et Mois au lot P3. */}
      <div
        role="group"
        aria-label="Vue"
        className="flex rounded-control bg-surface-2 p-0.5 max-md:hidden"
      >
        <span
          aria-current="true"
          className="inline-flex h-control-sm flex-1 items-center justify-center rounded-control bg-(--control-on) px-3 text-small font-semibold text-fg shadow-rest ring-1 ring-border-strong md:flex-none"
        >
          Jour
        </span>
        {["Semaine", "Mois"].map((v) => (
          <span
            key={v}
            aria-disabled="true"
            title="Bientôt (lot P3)"
            className="inline-flex h-control-sm flex-1 cursor-not-allowed items-center justify-center gap-1 rounded-control px-3 text-small font-medium text-fg-subtle md:flex-none"
          >
            {v} <span className="text-label">· bientôt</span>
          </span>
        ))}
      </div>
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
      <ToolbarSearch
        defaultValue={q}
        label="Agent ou n° de train"
        placeholder="Agent ou n° de train"
        className="max-md:flex-1 max-md:basis-0 md:w-56"
        data-testid="planner-search"
      />
      <button type="submit" className="sr-only">
        Rechercher
      </button>
    </FilterForm>
  );
  return (
    <section aria-label="Planificateur de tâches PMR">
      <PlannerScreen
        data={data}
        stations={stations}
        today={today}
        serverNow={Date.now()}
        filters={filters}
        q={q}
        initialTask={/^[a-z0-9]{15}$/.test(sp.tache ?? "") ? sp.tache! : ""}
        canWrite={can(user, "planner:write")}
        canManage={can(user, "planner:manage")}
      />
    </section>
  );
}
