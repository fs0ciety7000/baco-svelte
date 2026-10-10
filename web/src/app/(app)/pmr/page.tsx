import type { Metadata } from "next";

import { AssistBoard } from "@/components/pmr/assist-board";
import { SyncStatus } from "@/components/pmr/sync-status";
import { hideCancelled, PmrFilterBar, type PmrFilters } from "@/components/pmr/filter-bar";
import { can } from "@/lib/permissions";
import { pl } from "@/lib/utils";
import { addDays, brusselsDay, isValidDay } from "@/lib/orders/time";
import { requirePermission } from "@/server/auth";
import { resolveCancelledPref } from "@/server/pmr-prefs";
import { dicosSyncState, listAssists, listTrainStates } from "@/server/data/pmr";

import { LiveRefresh } from "../commandes/live-refresh";

export const metadata: Metadata = { title: "Missions PMR · CSM" };

export default async function Page({ searchParams }: { searchParams: Promise<PmrFilters> }) {
  const user = await requirePermission("deplacements:read");
  const sp = await searchParams;
  // Choix « masquer les annulées » : paramètre d'URL (mémorisé), sinon préférence de l'agent.
  const f: PmrFilters = { ...sp, annulees: await resolveCancelledPref(user, sp.annulees) };
  const today = brusselsDay();
  const du = isValidDay(f.du) ? f.du : today;
  const au = isValidDay(f.au) && f.au >= du ? f.au : du;
  const canPmr = can(user, "pmr:read");
  const [{ rows, total }, sync, delays] = await Promise.all([
    listAssists(
      {
        from: du,
        to: au,
        district: f.district,
        q: f.q,
        status: f.statut,
        hideCancelled: hideCancelled(f),
      },
      { canPmr },
    ),
    dicosSyncState("missions", du, au),
    listTrainStates(du, au),
  ]);
  return (
    <section className="flex flex-col gap-4" aria-label="Missions PMR">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body text-fg-muted" data-testid="assists-count">
          <span className="font-mono text-fg tabular">{total}</span> {pl(total, "mission")}
          {total > rows.length ? ` · ${rows.length} affichées : réduis la période` : ""}
        </p>
        {/* Plus de création manuelle : les missions sont synchronisées depuis DICOS (décision du 8 octobre 2026). */}
        <div className="flex flex-wrap items-center gap-3">
          {sync ? <SyncStatus {...sync} /> : null}
          <LiveRefresh topics={["pmr_assists", "dicos_syncs", "mission_trains"]} />
        </div>
      </div>
      <PmrFilterBar
        action="/pmr"
        filters={{ ...f, du, au }}
        shortcuts={[
          { label: "Aujourd'hui", du: today, au: today },
          { label: "Demain", du: addDays(today, 1), au: addDays(today, 1) },
          { label: "7 prochains jours", du: today, au: addDays(today, 6) },
        ]}
      />
      <AssistBoard
        rows={rows}
        canPmr={canPmr}
        groupByDay
        district={f.district ?? ""}
        notSynced={sync ? !sync.covered : false}
        delays={delays}
      />
    </section>
  );
}
