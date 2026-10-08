import type { Metadata } from "next";

import { AssistBoard } from "@/components/pmr/assist-board";
import { PmrFilterBar, type PmrFilters } from "@/components/pmr/filter-bar";
import { can } from "@/lib/permissions";
import { addDays, brusselsDay, isValidDay } from "@/lib/orders/time";
import { requirePermission } from "@/server/auth";
import { listAssists, listZones } from "@/server/data/pmr";

import { LiveRefresh } from "../commandes/live-refresh";

export const metadata: Metadata = { title: "Missions PMR · CSM" };

export default async function Page({ searchParams }: { searchParams: Promise<PmrFilters> }) {
  const user = await requirePermission("deplacements:read");
  const f = await searchParams;
  const today = brusselsDay();
  const du = isValidDay(f.du) ? f.du : today;
  const au = isValidDay(f.au) && f.au >= du ? f.au : du;
  const canPmr = can(user, "pmr:read");
  const [{ rows, total }, zones] = await Promise.all([
    listAssists({ from: du, to: au, zone: f.zone, q: f.q, status: f.statut }, { canPmr }),
    listZones(),
  ]);
  return (
    <section className="flex flex-col gap-4" aria-label="Missions PMR">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body text-fg-muted" data-testid="assists-count">
          <span className="font-mono text-fg tabular">{total}</span> mission(s)
          {total > rows.length ? ` · ${rows.length} affichées : réduisez la période` : ""}
        </p>
        {/* Plus de création manuelle : les missions sont synchronisées depuis DICOS (décision du 8 octobre 2026). */}
        <LiveRefresh topics={["pmr_assists"]} />
      </div>
      <PmrFilterBar
        action="/pmr"
        filters={{ ...f, du, au }}
        zones={zones}
        shortcuts={[
          { label: "Aujourd'hui", du: today, au: today },
          { label: "Demain", du: addDays(today, 1), au: addDays(today, 1) },
          { label: "7 prochains jours", du: today, au: addDays(today, 6) },
        ]}
      />
      <AssistBoard
        rows={rows}
        canWrite={can(user, "deplacements:write")}
        canPmr={canPmr}
        groupByDay
      />
    </section>
  );
}
