import type { Metadata } from "next";

import { TrackingBoard } from "@/components/orders/tracking-board";
import { SegmentedNav } from "@/components/ui/filters";
import { TOOLBAR } from "@/components/ui/list-toolbar";
import { can } from "@/lib/permissions";
import { requireRoute } from "@/server/auth";
import { listOrders, VIEWS, viewCounts, type View } from "@/server/data/orders";

import { LiveRefresh } from "../live-refresh";

export const metadata: Metadata = { title: "Suivi commun · CSM" };

const VIEW_LABEL: Record<View, string> = {
  "a-envoyer": "À envoyer",
  aujourdhui: "Aujourd'hui",
  "en-cours": "En cours",
  toutes: "Toutes",
};
const KINDS = [
  { id: "all", label: "Bus + taxi" },
  { id: "bus", label: "Bus" },
  { id: "taxi", label: "Taxi" },
] as const;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; type?: string }>;
}) {
  const user = await requireRoute("/commandes/suivi");
  const sp = await searchParams;
  const view: View = VIEWS.find((v) => v === sp.vue) ?? "a-envoyer";
  const kind = KINDS.find((k) => k.id === sp.type)?.id ?? "all";
  const ctx = {
    userId: user.id,
    canBus: can(user, "otto:read"),
    canTaxi: can(user, "generate_taxi:read"),
  };
  const [{ rows, total }, counts] = await Promise.all([
    listOrders({ view, kind, limit: 200 }, ctx),
    viewCounts(ctx),
  ]);
  const topics = [ctx.canBus && "bus_orders", ctx.canTaxi && "taxi_orders"].filter(
    Boolean,
  ) as string[];
  const link = (v: View, k: string) =>
    `/commandes/suivi?vue=${v}${k !== "all" ? `&type=${k}` : ""}`;

  return (
    <section className="flex flex-col gap-4" aria-label="Suivi des commandes">
      {/* Barre d'outils sur une ligne (v4 lot 6) : vues enregistrées avec compteurs, type de bon, direct à droite. */}
      <div className={TOOLBAR} data-testid="tracking-toolbar">
        <nav aria-label="Vues enregistrées" className="min-w-0 max-md:w-full">
          <SegmentedNav
            label="Vue"
            className="max-md:overflow-x-auto"
            items={VIEWS.map((v) => ({
              label: VIEW_LABEL[v],
              href: link(v, kind),
              current: v === view,
              testId: `view-${v}`,
              count: v !== "toutes" ? counts[v] : undefined,
            }))}
          />
        </nav>
        {ctx.canBus && ctx.canTaxi ? (
          <SegmentedNav
            label="Type de commande"
            items={KINDS.map((k) => ({
              label: k.label,
              href: link(view, k.id),
              current: k.id === kind,
            }))}
          />
        ) : null}
        <span className="ml-auto">
          <LiveRefresh topics={topics} />
        </span>
      </div>
      <TrackingBoard
        rows={rows}
        coordinator={{ bus: can(user, "bus:reopen"), taxi: can(user, "taxi:reopen") }}
        showSince={view === "a-envoyer"}
      />
      {total > rows.length ? (
        <p className="text-small text-fg-muted">
          {rows.length} commandes affichées sur {total}.
        </p>
      ) : null}
    </section>
  );
}
