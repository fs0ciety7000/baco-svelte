import { Download } from "lucide-react";
import type { Metadata } from "next";

import { AssistBoard } from "@/components/pmr/assist-board";
import { PmrFilterBar, type PmrFilters } from "@/components/pmr/filter-bar";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import { addDays, brusselsDay, isValidDay } from "@/lib/orders/time";
import { requirePermission } from "@/server/auth";
import { historyRange, listAssists } from "@/server/data/pmr";

export const metadata: Metadata = { title: "Historique PMR · CSM" };

export default async function Page({ searchParams }: { searchParams: Promise<PmrFilters> }) {
  const user = await requirePermission("deplacements:read");
  const f = await searchParams;
  const today = brusselsDay();
  const def = historyRange(today);
  const du = isValidDay(f.du) ? f.du : def.from;
  // Sans date de fin : jusqu'à hier (ou le jour de début s'il est postérieur).
  const au = isValidDay(f.au) && f.au >= du ? f.au : def.to >= du ? def.to : du;
  const canPmr = can(user, "pmr:read");
  const { rows, total } = await listAssists(
    { from: du, to: au, district: f.district, q: f.q, status: f.statut, limit: 500 },
    { canPmr, order: "desc" },
  );
  const exportQuery = new URLSearchParams(
    Object.fromEntries(
      Object.entries({
        du,
        au,
        district: f.district ?? "",
        statut: f.statut ?? "",
        q: f.q ?? "",
      }).filter(([, v]) => v),
    ),
  );
  return (
    <section className="flex flex-col gap-4" aria-label="Historique PMR">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body text-fg-muted">
          <span className="font-mono text-fg tabular">{total}</span> mission(s)
          {total > rows.length ? ` · ${rows.length} affichées : affinez les filtres` : ""}
        </p>
        <Button asChild variant="secondary">
          <a href={`/api/pmr/export?${exportQuery}`} download>
            <Download aria-hidden /> Export CSV (sans nom)
          </a>
        </Button>
      </div>
      <PmrFilterBar
        action="/pmr/historique"
        filters={{ ...f, du, au }}
        shortcuts={[
          { label: "7 derniers jours", du: addDays(today, -7), au: addDays(today, -1) },
          { label: "30 derniers jours", du: def.from, au: def.to },
          { label: "Depuis janvier", du: `${today.slice(0, 4)}-01-01`, au: today },
        ]}
      />
      <AssistBoard rows={rows} canPmr={canPmr} groupByDay={false} district={f.district ?? ""} />
    </section>
  );
}
