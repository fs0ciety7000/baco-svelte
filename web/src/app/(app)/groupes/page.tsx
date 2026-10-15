import type { Metadata } from "next";

import { hideCancelled, PmrFilterBar, type PmrFilters } from "@/components/pmr/filter-bar";
import { GroupAlea, GroupBoard } from "@/components/pmr/group-board";
import { ListStatus } from "@/components/pmr/list-status";
import Link from "next/link";
import { SyncStatus } from "@/components/pmr/sync-status";
import { EmptyState } from "@/components/ui/misc";
import { addDays, brusselsDay, isValidDay } from "@/lib/orders/time";
import { effectiveDistricts } from "@/lib/pmr/district-filter";
import { brusselsMinutes } from "@/lib/pmr/now-line";
import { userDistricts } from "@/lib/team";
import { requireRoute } from "@/server/auth";
import { resolveCancelledPref } from "@/server/pmr-prefs";
import { listGroups } from "@/server/data/groups";
import { dicosSyncState, listTrainStates } from "@/server/data/pmr";
import { can } from "@/lib/permissions";
import { pl } from "@/lib/utils";

import { LiveRefresh } from "../commandes/live-refresh";

export const metadata: Metadata = { title: "Groupes · CSM" };

export default async function Page({ searchParams }: { searchParams: Promise<PmrFilters> }) {
  const user = await requireRoute("/groupes");
  const sp = await searchParams;
  // Choix « masquer les annulées » : paramètre d'URL (mémorisé), sinon préférence de l'agent.
  const f: PmrFilters = { ...sp, annulees: await resolveCancelledPref(user, sp.annulees) };
  const today = brusselsDay();
  const du = isValidDay(f.du) ? f.du : today;
  const au = isValidDay(f.au) && f.au >= du ? f.au : du;
  // District : paramètre d'URL s'il est présent, sinon les districts du jour de l'agent (11 oct. 2026).
  const myDistricts = effectiveDistricts(undefined, userDistricts(user, today));
  const district = effectiveDistricts(sp.district, userDistricts(user, today));
  const [{ rows, total }, sync, delays] = await Promise.all([
    listGroups({
      from: du,
      to: au,
      district,
      q: f.q,
      status: f.statut,
      hideCancelled: hideCancelled(f),
    }),
    dicosSyncState("groups", du, au),
    listTrainStates(du, au),
  ]);
  return (
    <section className="flex flex-col gap-3" aria-label="Groupes">
      <PmrFilterBar
        action="/groupes"
        filters={{ ...f, du, au, district: district || "tous" }}
        myDistricts={myDistricts}
        statuses={["prevue", "realisee", "annulee"]}
        shortcuts={[
          { label: "Aujourd'hui", du: today, au: today },
          { label: "Demain", du: addDays(today, 1), au: addDays(today, 1) },
          { label: "7 jours", du: today, au: addDays(today, 6) },
        ]}
        actions={
          <GroupAlea rows={rows} district={district} canMark={can(user, "deplacements:write")} />
        }
      />
      <ListStatus
        count={
          <span>
            <span className="font-medium text-fg tabular">{total}</span> {pl(total, "trajet")} de
            groupe
            {total > rows.length ? ` · ${rows.length} affichés : réduis la période` : ""}
          </span>
        }
        sync={sync ? <SyncStatus {...sync} /> : null}
        live={<LiveRefresh topics={["group_missions", "dicos_syncs", "mission_trains"]} />}
      />
      {rows.length === 0 ? (
        sync && !sync.lastAt ? (
          <EmptyState
            variant="first"
            title="Jamais synchronisé avec DICOS"
            description="Installe l'extension CSM puis lance la synchro depuis l'onglet DICOS ouvert : les groupes arrivent ici."
            action={
              <Link href="/extension" className="link">
                Extension CSM
              </Link>
            }
          />
        ) : sync && !sync.covered ? (
          <EmptyState
            framed
            title="Pas encore synchronisé"
            description="Aucune synchro DICOS pour cette période : lance la synchro depuis l'extension (onglet DICOS ouvert)."
          />
        ) : (
          <EmptyState
            framed
            title="Aucun groupe"
            description="Aucune mission de groupe pour cette période."
          />
        )
      ) : (
        <GroupBoard
          rows={rows}
          district={district}
          delays={delays}
          now={brusselsMinutes(new Date())}
          today={today}
        />
      )}
    </section>
  );
}
