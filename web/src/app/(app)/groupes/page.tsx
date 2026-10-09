import type { Metadata } from "next";
import { cookies } from "next/headers";

import { hideCancelled, PmrFilterBar, type PmrFilters } from "@/components/pmr/filter-bar";
import { CANCELLED_COOKIE, cancelledPref } from "@/lib/pmr/cancelled-pref";
import { GroupBoard } from "@/components/pmr/group-board";
import { SyncStatus } from "@/components/pmr/sync-status";
import { EmptyState } from "@/components/ui/misc";
import { addDays, brusselsDay, isValidDay } from "@/lib/orders/time";
import { requireRoute } from "@/server/auth";
import { listGroups } from "@/server/data/groups";
import { dicosSyncState } from "@/server/data/pmr";
import { pl } from "@/lib/utils";

import { LiveRefresh } from "../commandes/live-refresh";

export const metadata: Metadata = { title: "Groupes · CSM" };

export default async function Page({ searchParams }: { searchParams: Promise<PmrFilters> }) {
  await requireRoute("/groupes");
  const sp = await searchParams;
  // Choix « masquer les annulées » : paramètre d'URL, sinon dernier choix mémorisé (cookie).
  const f: PmrFilters = {
    ...sp,
    annulees: cancelledPref(sp.annulees, (await cookies()).get(CANCELLED_COOKIE)?.value),
  };
  const today = brusselsDay();
  const du = isValidDay(f.du) ? f.du : today;
  const au = isValidDay(f.au) && f.au >= du ? f.au : du;
  const [{ rows, total }, sync] = await Promise.all([
    listGroups({
      from: du,
      to: au,
      district: f.district,
      q: f.q,
      status: f.statut,
      hideCancelled: hideCancelled(f),
    }),
    dicosSyncState("groups", du, au),
  ]);
  return (
    <section className="flex flex-col gap-4" aria-label="Groupes">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body text-fg-muted">
          <span className="font-mono text-fg tabular">{total}</span> {pl(total, "trajet")} de groupe
          {total > rows.length ? ` · ${rows.length} affichés : réduis la période` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {sync ? <SyncStatus {...sync} /> : null}
          <LiveRefresh topics={["group_missions", "dicos_syncs"]} />
        </div>
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
        sync && !sync.covered ? (
          <EmptyState
            title="Pas encore synchronisé"
            description="Aucune synchro DICOS pour cette période : lance la synchro depuis l'extension (onglet DICOS ouvert)."
          />
        ) : (
          <EmptyState
            title="Aucun groupe"
            description="Aucune mission de groupe pour cette période."
          />
        )
      ) : (
        <GroupBoard rows={rows} district={f.district ?? ""} />
      )}
    </section>
  );
}
