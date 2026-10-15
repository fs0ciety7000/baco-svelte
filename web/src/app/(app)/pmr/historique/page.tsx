import { Download } from "lucide-react";
import type { Metadata } from "next";

import { pl } from "@/lib/utils";
import { AssistAlea, AssistBoard } from "@/components/pmr/assist-board";
import { hideCancelled, PmrFilterBar, type PmrFilters } from "@/components/pmr/filter-bar";
import { ListStatus } from "@/components/pmr/list-status";
import { ASSIST_STATUSES, parseStatuses } from "@/lib/pmr/model";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import { normalizeDistricts } from "@/lib/pmr/district-filter";
import { addDays, brusselsDay, isValidDay } from "@/lib/orders/time";
import { requirePermission } from "@/server/auth";
import { resolveCancelledPref } from "@/server/pmr-prefs";
import { historyRange, listAssists } from "@/server/data/pmr";

export const metadata: Metadata = { title: "Historique PMR · CSM" };

export default async function Page({ searchParams }: { searchParams: Promise<PmrFilters> }) {
  const user = await requirePermission("deplacements:read");
  const sp = await searchParams;
  // Choix « masquer les annulées » : paramètre d'URL (mémorisé), sinon préférence de l'agent.
  const f: PmrFilters = { ...sp, annulees: await resolveCancelledPref(user, sp.annulees) };
  const today = brusselsDay();
  const def = historyRange(today);
  const du = isValidDay(f.du) ? f.du : def.from;
  // Sans date de fin : jusqu'à hier (ou le jour de début s'il est postérieur).
  const au = isValidDay(f.au) && f.au >= du ? f.au : def.to >= du ? def.to : du;
  const canPmr = can(user, "pmr:read");
  // Un ou plusieurs districts (paramètre répété ou « DSO,DSE ») ; « tous » ou rien = tous.
  const district = normalizeDistricts(f.district);
  const { rows, total } = await listAssists(
    {
      from: du,
      to: au,
      district,
      q: f.q,
      status: f.statut,
      hideCancelled: hideCancelled(f),
      limit: 500,
    },
    { canPmr, order: "desc" },
  );
  const exportQuery = new URLSearchParams(
    Object.fromEntries(
      Object.entries({
        du,
        au,
        district,
        statut: parseStatuses(f.statut, ASSIST_STATUSES).join(","),
        q: f.q ?? "",
        annulees: hideCancelled(f) ? "masquees" : "",
      }).filter(([, v]) => v),
    ),
  );
  return (
    <section className="flex flex-col gap-3" aria-label="Historique PMR">
      <PmrFilterBar
        action="/pmr/historique"
        filters={{ ...f, du, au }}
        shortcuts={[
          { label: "7 derniers jours", du: addDays(today, -7), au: addDays(today, -1) },
          { label: "30 derniers jours", du: def.from, au: def.to },
          { label: "Depuis janvier", du: `${today.slice(0, 4)}-01-01`, au: today },
        ]}
        actions={
          <>
            <AssistAlea rows={rows} district={district} canMark={false} />
            <Button asChild variant="secondary" size="sm">
              <a href={`/api/pmr/export?${exportQuery}`} download>
                <Download aria-hidden /> Export CSV (sans nom)
              </a>
            </Button>
          </>
        }
      />
      <ListStatus
        count={
          <span>
            <span className="font-medium text-fg tabular">{total}</span> {pl(total, "mission")}
            {total > rows.length ? ` · ${rows.length} affichées : affine les filtres` : ""}
          </span>
        }
      />
      <AssistBoard rows={rows} canPmr={canPmr} groupByDay={false} district={district} />
    </section>
  );
}
