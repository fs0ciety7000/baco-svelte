import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DateField } from "@/components/ui/date-field";
import { DistrictPicker } from "@/components/ui/district-picker";
import { FormAutoSubmit } from "@/components/ui/form-auto-submit";
import { appendDistricts, DISTRICT_NAME_OPTIONS, parseDistricts } from "@/lib/district-param";
import { FilterForm } from "@/components/ui/filter-form";
import { B201Editor } from "@/components/orders/b201-editor";
import { B201Keys } from "@/components/orders/b201-keys";
import { Button } from "@/components/ui/button";
import { canWriteB201 } from "@/lib/permissions";
import { DISTRICTS } from "@/lib/orders/schemas";
import { addDays, brusselsDay, formatLongDay, isValidDay } from "@/lib/orders/time";
import { requirePermission } from "@/server/auth";
import { b201Data } from "@/server/data/b201";

import { LiveRefresh } from "../live-refresh";

export const metadata: Metadata = { title: "Remise B201 · CSM" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string; district?: string | string[] }>;
}) {
  const user = await requirePermission("b201:read");
  const sp = await searchParams;
  const today = brusselsDay();
  const day = isValidDay(sp.jour) ? sp.jour : today;
  // Un ou plusieurs districts (paramètre répété) ; vide = tous.
  const districts = parseDistricts(sp.district, DISTRICTS);
  const data = await b201Data(day, districts, user);
  const q = (d: string) =>
    `/commandes/b201?${appendDistricts(new URLSearchParams({ jour: d }), districts)}`;
  const pdfQuery = districts.length ? `?${appendDistricts(new URLSearchParams(), districts)}` : "";

  return (
    <section className="flex flex-col gap-4" aria-label="Remise de service B201">
      <B201Keys prev={q(addDays(day, -1))} next={q(addDays(day, 1))} today={q(today)} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary" size="icon">
            <Link href={q(addDays(day, -1))} aria-label="Jour précédent">
              <ChevronLeft />
            </Link>
          </Button>
          <FilterForm action="/commandes/b201" className="flex items-center gap-2">
            <label className="sr-only" htmlFor="b201-jour">
              Jour
            </label>
            <DateField
              id="b201-jour"
              name="jour"
              defaultValue={day}
              label="Jour"
              className="w-40"
            />
            {districts.map((d) => (
              <input key={d} type="hidden" name="district" value={d} />
            ))}
            <Button type="submit" variant="ghost" size="sm">
              Aller
            </Button>
          </FilterForm>
          <Button asChild variant="secondary" size="icon">
            <Link href={q(addDays(day, 1))} aria-label="Jour suivant">
              <ChevronRight />
            </Link>
          </Button>
          {day !== today ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={q(today)}>Aujourd&apos;hui</Link>
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <LiveRefresh topics={["bus_orders", "taxi_orders", "b201_reports"]} />
          <Button asChild variant="secondary">
            <a href={`/api/commandes/b201/${day}/pdf${pdfQuery}`} target="_blank" rel="noopener">
              <FileText aria-hidden /> PDF
            </a>
          </Button>
        </div>
      </div>
      <p className="display text-h3 text-fg first-letter:uppercase" data-testid="b201-day">
        {formatLongDay(day)}
      </p>
      {/* Districts (refonte R4) : un, plusieurs ou tous ; le PDF suit le même filtre. */}
      <FilterForm action="/commandes/b201">
        <FormAutoSubmit />
        <input type="hidden" name="jour" value={day} />
        <DistrictPicker
          name="district"
          label="District"
          options={DISTRICT_NAME_OPTIONS}
          defaultValues={districts}
          allLabel="Tous les districts"
        />
      </FilterForm>
      {data.hasLegacy ? (
        <p className="text-small text-fg-muted">
          Une B201 saisie dans BACO existe pour ce jour (conservée en archive).
        </p>
      ) : null}
      <B201Editor
        // Changer de jour recharge toujours le rapport (bug B1 de BACO). Pas de clé sur `updated` : le temps
        // réel relit la page après chaque enregistrement et ne doit pas effacer la saisie en cours.
        key={day}
        day={day}
        entries={data.entries}
        initialManual={data.manual}
        initialNotes={data.notes}
        updated={data.updated}
        reportId={data.reportId}
        canWrite={canWriteB201(user)}
      />
    </section>
  );
}
