import type { Metadata } from "next";

import { pl } from "@/lib/utils";
import { PmrFilterBar, type PmrFilters } from "@/components/pmr/filter-bar";
import { GroupBoard } from "@/components/pmr/group-board";
import { EmptyState } from "@/components/ui/misc";
import { addDays, brusselsDay, isValidDay } from "@/lib/orders/time";
import { requireRoute } from "@/server/auth";
import { listGroups } from "@/server/data/groups";

import { LiveRefresh } from "../commandes/live-refresh";

export const metadata: Metadata = { title: "Groupes · CSM" };

export default async function Page({ searchParams }: { searchParams: Promise<PmrFilters> }) {
  await requireRoute("/groupes");
  const f = await searchParams;
  const today = brusselsDay();
  const du = isValidDay(f.du) ? f.du : today;
  const au = isValidDay(f.au) && f.au >= du ? f.au : du;
  const { rows, total } = await listGroups({
    from: du,
    to: au,
    district: f.district,
    q: f.q,
    status: f.statut,
  });
  return (
    <section className="flex flex-col gap-4" aria-label="Groupes">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body text-fg-muted">
          <span className="font-mono text-fg tabular">{total}</span> {pl(total, "trajet")} de groupe
          {total > rows.length ? ` · ${rows.length} affichés : réduisez la période` : ""}
        </p>
        <LiveRefresh topics={["group_missions"]} />
      </div>
      <PmrFilterBar
        action="/groupes"
        filters={{ ...f, du, au }}
        statuses={["prevue", "realisee", "annulee"]}
        shortcuts={[
          { label: "Aujourd'hui", du: today, au: today },
          { label: "Demain", du: addDays(today, 1), au: addDays(today, 1) },
          { label: "7 prochains jours", du: today, au: addDays(today, 6) },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="Aucun groupe"
          description="Aucune mission de groupe pour cette période (synchronisées depuis DICOS par l'extension)."
        />
      ) : (
        <GroupBoard rows={rows} district={f.district ?? ""} />
      )}
    </section>
  );
}
