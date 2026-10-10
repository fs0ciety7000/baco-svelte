import type { Metadata } from "next";
import Link from "next/link";

import { HandoverView } from "@/components/ops/handover-view";
import { ChipRow, FilterChip } from "@/components/ui/filters";
import { brusselsTime } from "@/lib/orders/time";
import { can } from "@/lib/permissions";
import { requireRoute } from "@/server/auth";
import { buildHandover, HANDOVER_CODES, handoverDistricts } from "@/server/data/handover";

import { LiveRefresh } from "../../commandes/live-refresh";

export const metadata: Metadata = { title: "Relève · CSM" };

/** Relève de service (demande du 10 oct. 2026) : synthèse de ce qui reste ouvert, à copier ou épingler au Journal. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ district?: string }>;
}) {
  const user = await requireRoute("/operations/releve");
  const { district } = await searchParams;
  const codes = handoverDistricts(user, district);
  const data = await buildHandover(user, codes);
  const scope = codes.length ? codes.join(" · ") : "tous districts";
  const chip = (label: string, value: string | undefined, pressed: boolean) => (
    <FilterChip key={label} asChild pressed={pressed}>
      <Link href={value ? `/operations/releve?district=${value}` : "/operations/releve"}>
        {label}
      </Link>
    </FilterChip>
  );
  return (
    <section className="flex flex-col gap-4" aria-label="Relève de service">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChipRow aria-label="Districts de la relève">
          {chip("Mes districts", undefined, !district)}
          {HANDOVER_CODES.map((c) => chip(c, c, district === c))}
          {chip("Tous", "tous", district === "tous")}
        </ChipRow>
        <a
          href={district ? `/tv?district=${district}` : "/tv"}
          target="_blank"
          rel="noopener"
          className="link text-small"
          data-testid="tv-link"
        >
          Écran commun (TV)
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
