import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FilterForm } from "@/components/ui/filter-form";
import { B201Editor } from "@/components/orders/b201-editor";
import { B201Keys } from "@/components/orders/b201-keys";
import { Button } from "@/components/ui/button";
import { canWriteB201 } from "@/lib/permissions";
import { DISTRICTS } from "@/lib/orders/schemas";
import { addDays, brusselsDay, formatLongDay, isValidDay } from "@/lib/orders/time";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth";
import { b201Data } from "@/server/data/b201";

import { LiveRefresh } from "../live-refresh";

export const metadata: Metadata = { title: "Remise B201 · CSM" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string; district?: string }>;
}) {
  const user = await requirePermission("b201:read");
  const sp = await searchParams;
  const today = brusselsDay();
  const day = isValidDay(sp.jour) ? sp.jour : today;
  const district = (DISTRICTS as readonly string[]).includes(sp.district ?? "")
    ? sp.district
    : undefined;
  const data = await b201Data(day, district, user);
  const q = (d: string, dist = district) =>
    `/commandes/b201?jour=${d}${dist ? `&district=${encodeURIComponent(dist)}` : ""}`;

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
            <input
              id="b201-jour"
              type="date"
              name="jour"
              defaultValue={day}
              className="h-control border border-border-strong bg-surface px-3 text-body text-fg"
            />
            {district ? <input type="hidden" name="district" value={district} /> : null}
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
            <a
              href={`/api/commandes/b201/${day}/pdf${district ? `?district=${encodeURIComponent(district)}` : ""}`}
              target="_blank"
              rel="noopener"
            >
              <FileText aria-hidden /> PDF
            </a>
          </Button>
        </div>
      </div>
      <p className="display text-h3 text-fg first-letter:uppercase" data-testid="b201-day">
        {formatLongDay(day)}
      </p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="District">
        {[undefined, ...DISTRICTS].map((d) => (
          <Link
            key={d ?? "tous"}
            href={q(day, d)}
            aria-current={d === district ? "true" : undefined}
            className={cn(
              "inline-flex h-11 items-center px-3 text-small md:h-control-sm",
              d === district ? "bg-surface-2 text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {d ?? "Tous les districts"}
          </Link>
        ))}
      </div>
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
