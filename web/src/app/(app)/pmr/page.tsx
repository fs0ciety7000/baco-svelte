import type { Metadata } from "next";

import { AssistAlea, AssistBoard } from "@/components/pmr/assist-board";
import { ListStatus } from "@/components/pmr/list-status";
import { SyncStatus } from "@/components/pmr/sync-status";
import { hideCancelled, PmrFilterBar, type PmrFilters } from "@/components/pmr/filter-bar";
import { can } from "@/lib/permissions";
import { pl } from "@/lib/utils";
import { addDays, brusselsDay, isValidDay } from "@/lib/orders/time";
import { effectiveDistricts } from "@/lib/pmr/district-filter";
import { brusselsMinutes } from "@/lib/pmr/now-line";
import { userDistricts } from "@/lib/team";
import { requirePermission } from "@/server/auth";
import { listGroups } from "@/server/data/groups";
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
  // District : paramètre d'URL s'il est présent, sinon les districts du jour de l'agent (11 oct. 2026).
  const myDistricts = effectiveDistricts(undefined, userDistricts(user, today));
  const district = effectiveDistricts(sp.district, userDistricts(user, today));
  const canPmr = can(user, "pmr:read");
  const [{ rows, total }, sync, delays, groups] = await Promise.all([
    listAssists(
      {
        from: du,
        to: au,
        district,
        q: f.q,
        status: f.statut,
        hideCancelled: hideCancelled(f),
      },
      { canPmr },
    ),
    dicosSyncState("missions", du, au),
    listTrainStates(du, au),
    // Export ALEA commun PMR + groupes (10 oct. 2026) : groupes de la même période et du même district.
    canPmr
      ? listGroups({ from: du, to: au, district, hideCancelled: true })
          .then((r) => r.rows)
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  const canMark = can(user, "deplacements:write");
  return (
    <section className="flex flex-col gap-3" aria-label="Missions PMR">
      {/* Barre d'outils sur une ligne (v4 lot 4) ; plus de création manuelle : les missions viennent de DICOS. */}
      <PmrFilterBar
        action="/pmr"
        filters={{ ...f, du, au, district: district || "tous" }}
        myDistricts={myDistricts}
        shortcuts={[
          { label: "Aujourd'hui", du: today, au: today },
          { label: "Demain", du: addDays(today, 1), au: addDays(today, 1) },
          { label: "7 jours", du: today, au: addDays(today, 6) },
        ]}
        actions={<AssistAlea rows={rows} groups={groups} district={district} canMark={canMark} />}
      />
      <ListStatus
        count={
          <span data-testid="assists-count">
            <span className="font-medium text-fg tabular">{total}</span> {pl(total, "mission")}
            {total > rows.length ? ` · ${rows.length} affichées : réduis la période` : ""}
          </span>
        }
        sync={sync ? <SyncStatus {...sync} /> : null}
        live={<LiveRefresh topics={["pmr_assists", "dicos_syncs", "mission_trains"]} />}
      />
      <AssistBoard
        rows={rows}
        canPmr={canPmr}
        groupByDay
        district={district}
        notSynced={sync ? !sync.covered : false}
        neverSynced={sync ? !sync.lastAt : false}
        delays={delays}
        now={brusselsMinutes(new Date())}
        today={today}
      />
    </section>
  );
}
