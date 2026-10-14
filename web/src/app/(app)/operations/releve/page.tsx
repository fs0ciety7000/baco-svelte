import type { Metadata } from "next";

import { HandoverView } from "@/components/ops/handover-view";
import { DistrictPicker } from "@/components/ui/district-picker";
import { FilterForm } from "@/components/ui/filter-form";
import { FormAutoSubmit } from "@/components/ui/form-auto-submit";
import { appendDistricts } from "@/lib/district-param";
import { brusselsTime } from "@/lib/orders/time";
import { can } from "@/lib/permissions";
import { requireRoute } from "@/server/auth";
import { buildHandover, handoverDistricts } from "@/server/data/handover";

import { LiveRefresh } from "../../commandes/live-refresh";

export const metadata: Metadata = { title: "Relève · CSM" };

/** Relève de service (demande du 10 oct. 2026) : synthèse de ce qui reste ouvert, à copier ou épingler au Journal. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ district?: string | string[] }>;
}) {
  const user = await requireRoute("/operations/releve");
  const { district } = await searchParams;
  const codes = handoverDistricts(user, district);
  const data = await buildHandover(user, codes);
  const scope = codes.length ? codes.join(" · ") : "tous districts";
  const mine = handoverDistricts(user, undefined);
  // Paramètre district transmis à l'écran commun (rien = districts du compte).
  const tvDistricts =
    district === undefined
      ? new URLSearchParams()
      : codes.length
        ? appendDistricts(new URLSearchParams(), codes)
        : new URLSearchParams({ district: "tous" });
  const tvQuery = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams(extra);
    tvDistricts.forEach((v, k) => p.append(k, v));
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  return (
    <section className="flex flex-col gap-4" aria-label="Relève de service">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterForm action="/operations/releve" className="min-w-0">
          <FormAutoSubmit />
          <DistrictPicker
            name="district"
            label="Districts de la relève"
            defaultValues={codes}
            emptyValue="tous"
            mine={mine}
          />
        </FilterForm>
        <a
          href={`/tv${tvQuery()}`}
          target="_blank"
          rel="noopener"
          className="link text-small"
          data-testid="tv-link"
        >
          Écran commun (TV)
        </a>
        <a
          href={`/tv${tvQuery({ theme: "rail" })}`}
          target="_blank"
          rel="noopener"
          className="link text-small"
        >
          (thème Rail)
        </a>
        <LiveRefresh
          topics={[
            "bus_orders",
            "taxi_orders",
            "pmr_assists",
            "group_missions",
            "ops_log",
            "mission_trains",
            "alea_marks",
          ]}
        />
      </div>
      <HandoverView
        data={data}
        scope={scope}
        author={user.name || user.username || user.email}
        at={brusselsTime(new Date(data.generatedAt))}
        canPin={can(user, "journal:write")}
      />
    </section>
  );
}
