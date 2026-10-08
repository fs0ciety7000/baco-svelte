import type { Metadata } from "next";
import Link from "next/link";

import { TrackingBoard } from "@/components/orders/tracking-board";
import { can } from "@/lib/permissions";
import { isCoordinator } from "@/lib/orders/status";
import { cn } from "@/lib/utils";
import { requireRoute } from "@/server/auth";
import { listOrders, VIEWS, viewCounts, type View } from "@/server/data/orders";

import { LiveRefresh } from "../live-refresh";

export const metadata: Metadata = { title: "Suivi commun · CSM" };

const VIEW_LABEL: Record<View, string> = {
  "a-confirmer": "À confirmer",
  aujourdhui: "Aujourd'hui",
  "en-cours": "En cours",
  brouillons: "Mes brouillons",
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
  const view: View = VIEWS.find((v) => v === sp.vue) ?? "a-confirmer";
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Vues enregistrées" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <ul className="flex gap-1.5">
            {VIEWS.map((v) => (
              <li key={v}>
                <Link
                  href={link(v, kind)}
                  aria-current={v === view ? "page" : undefined}
                  className={cn(
                    "inline-flex h-11 items-center gap-2 border px-3 text-body whitespace-nowrap md:h-control",
                    v === view
                      ? "border-accent bg-[color-mix(in_oklab,var(--accent)_12%,var(--surface))] text-fg"
                      : "border-border text-fg-muted hover:text-fg",
                  )}
                  data-testid={`view-${v}`}
                >
                  {VIEW_LABEL[v]}
                  {v !== "toutes" ? (
                    <span className="font-mono text-small tabular text-fg-muted">{counts[v]}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <LiveRefresh topics={topics} />
      </div>
      {ctx.canBus && ctx.canTaxi ? (
        <div className="flex gap-1.5" role="group" aria-label="Type de commande">
          {KINDS.map((k) => (
            <Link
              key={k.id}
              href={link(view, k.id)}
              aria-current={k.id === kind ? "true" : undefined}
              className={cn(
                "inline-flex h-11 items-center px-3 text-small md:h-control-sm",
                k.id === kind ? "bg-surface-2 text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {k.label}
            </Link>
          ))}
        </div>
      ) : null}
      <TrackingBoard
        rows={rows}
        coordinator={isCoordinator(user.role)}
        showSince={view === "a-confirmer"}
      />
      {total > rows.length ? (
        <p className="text-small text-fg-muted">
          {rows.length} commandes affichées sur {total}.
        </p>
      ) : null}
    </section>
  );
}
