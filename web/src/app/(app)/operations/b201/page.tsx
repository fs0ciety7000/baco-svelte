import { ChevronLeft, ChevronRight, FileText, Monitor } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { B201Board } from "@/components/ops/b201-board";
import { HandoverView } from "@/components/ops/handover-view";
import { B201Keys } from "@/components/orders/b201-keys";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { DistrictPicker } from "@/components/ui/district-picker";
import { FilterForm } from "@/components/ui/filter-form";
import { ChipRow, FilterChip } from "@/components/ui/filters";
import { FormAutoSubmit } from "@/components/ui/form-auto-submit";
import { appendDistricts, parseDistricts, type DistrictParam } from "@/lib/district-param";
import { DISTRICTS } from "@/lib/orders/schemas";
import { addDays, brusselsDay, brusselsTime, formatLongDay, isValidDay } from "@/lib/orders/time";
import { can, canWriteB201 } from "@/lib/permissions";
import { requireRoute } from "@/server/auth";
import { b201Data } from "@/server/data/b201";
import { buildHandover, handoverDistricts } from "@/server/data/handover";

import { LiveRefresh } from "../../commandes/live-refresh";

export const metadata: Metadata = { title: "B201 · CSM" };

/**
 * B201 (15 oct. 2026 : la Relève est renommée « B201 » et remplace l'ancienne remise de Ressources › B201). Un jour :
 * synthèse de la relève (aujourd'hui seulement, `journal:read`), notes et commentaires en Markdown et transports du jour
 * (`b201:read`, écriture `b201:write` / `b201:update`). Districts : ceux du jour par défaut, « tous » sinon ; codes ou noms
 * acceptés (anciens liens de la remise et de la relève).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string; district?: DistrictParam }>;
}) {
  const user = await requireRoute("/operations/b201");
  const sp = await searchParams;
  const today = brusselsDay();
  const day = isValidDay(sp.jour) ? sp.jour : today;
  const codes = handoverDistricts(user, sp.district ?? undefined);
  const names = parseDistricts(codes, DISTRICTS);
  const mine = handoverDistricts(user, undefined);
  const canNotes = can(user, "b201:read");
  const canHandover = can(user, "journal:read") && day === today;

  const [data, handover] = await Promise.all([
    canNotes ? b201Data(day, names, user) : Promise.resolve(null),
    canHandover ? buildHandover(user, codes) : Promise.resolve(null),
  ]);

  // Paramètre district gardé dans les liens (rien = districts du jour de l'agent).
  const districtQuery = (p: URLSearchParams) =>
    sp.district === undefined
      ? p
      : codes.length
        ? appendDistricts(p, codes)
        : (p.set("district", "tous"), p);
  const q = (d: string) => `/operations/b201?${districtQuery(new URLSearchParams({ jour: d }))}`;
  const pdfParams = codes.length
    ? appendDistricts(new URLSearchParams(), codes)
    : new URLSearchParams();
  const pdfQuery = pdfParams.size ? `?${pdfParams}` : "";
  const tvQuery = (extra: Record<string, string> = {}) => {
    const p = districtQuery(new URLSearchParams(extra));
    return p.size ? `?${p}` : "";
  };
  const scope = codes.length ? codes.join(" · ") : "tous districts";

  return (
    <section className="flex flex-col gap-5" aria-label="B201">
      <B201Keys prev={q(addDays(day, -1))} next={q(addDays(day, 1))} today={q(today)} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary" size="icon">
            <Link href={q(addDays(day, -1))} aria-label="Jour précédent">
              <ChevronLeft />
            </Link>
          </Button>
          <FilterForm action="/operations/b201" className="flex items-center gap-2">
            <FormAutoSubmit />
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
            {sp.district !== undefined
              ? (codes.length ? codes : ["tous"]).map((d) => (
                  <input key={d} type="hidden" name="district" value={d} />
                ))
              : null}
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
        <div className="flex flex-wrap items-center gap-2">
          <LiveRefresh
            topics={[
              "bus_orders",
              "taxi_orders",
              "b201_reports",
              "pmr_assists",
              "group_missions",
              "ops_log",
              "mission_trains",
              "alea_marks",
            ]}
          />
          {canHandover ? (
            <Button asChild variant="ghost" size="sm">
              <a href={`/tv${tvQuery()}`} target="_blank" rel="noopener" data-testid="tv-link">
                <Monitor aria-hidden /> Écran commun
              </a>
            </Button>
          ) : null}
          {canHandover ? (
            <a
              href={`/tv${tvQuery({ theme: "rail" })}`}
              target="_blank"
              rel="noopener"
              className="link text-small"
            >
              (thème Rail)
            </a>
          ) : null}
          {canNotes ? (
            <Button asChild variant="secondary">
              <a
                href={`/api/commandes/b201/${day}/pdf${pdfQuery}`}
                target="_blank"
                rel="noopener"
                data-testid="b201-pdf"
              >
                <FileText aria-hidden /> PDF
              </a>
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-h3 font-semibold text-fg first-letter:uppercase" data-testid="b201-day">
          {formatLongDay(day)}
        </p>
        <FilterForm action="/operations/b201" className="min-w-0">
          <FormAutoSubmit />
          <input type="hidden" name="jour" value={day} />
          <DistrictPicker
            name="district"
            label="Districts de la B201"
            defaultValues={codes}
            emptyValue="tous"
            mine={mine}
          />
        </FilterForm>
      </div>

      {/* Sommaire : la synthèse est longue, les notes et transports suivent (mobile surtout). */}
      {handover && data ? (
        <ChipRow aria-label="Parties de la B201">
          <FilterChip asChild>
            <a href="#b201-releve-title">Synthèse de la relève</a>
          </FilterChip>
          <FilterChip asChild>
            <a href="#b201-notes-title">Notes et commentaires</a>
          </FilterChip>
          <FilterChip asChild>
            <a href="#b201-transports-title">Transports du jour</a>
          </FilterChip>
        </ChipRow>
      ) : null}

      {handover ? (
        <section aria-labelledby="b201-releve-title" className="flex min-w-0 flex-col gap-3">
          <h2 id="b201-releve-title" className="scroll-mt-20 text-h3 font-semibold text-fg">
            Synthèse de la relève
          </h2>
          <HandoverView
            data={handover}
            scope={scope}
            author={user.name || user.username || user.email}
            at={brusselsTime(new Date(handover.generatedAt))}
            canPin={can(user, "journal:write")}
            notes={data?.content ?? ""}
          />
        </section>
      ) : can(user, "journal:read") ? (
        <p className="text-small text-fg-muted" data-testid="b201-releve-past">
          La synthèse de la relève est un instantané : elle n&apos;existe que pour aujourd&apos;hui.
        </p>
      ) : null}

      {data ? (
        <>
          {data.hasLegacy ? (
            <p className="text-small text-fg-muted">
              Une B201 saisie dans BACO existe pour ce jour (conservée en archive).
            </p>
          ) : null}
          <B201Board
            // Changer de jour recharge toujours le rapport (bug B1 de BACO). Pas de clé sur `updated` : le temps
            // réel relit la page après chaque enregistrement et ne doit pas effacer la saisie en cours.
            key={day}
            day={day}
            entries={data.entries}
            initialManual={data.manual}
            initialContent={data.content}
            updated={data.updated}
            updatedByName={data.updatedByName}
            versions={data.versions}
            reportId={data.reportId}
            canWrite={canWriteB201(user)}
            me={user.name || user.username || "toi"}
          />
        </>
      ) : null}
    </section>
  );
}
