"use client";

import { Check, RotateCcw, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import {
  DisturbanceWidget,
  ImpactsWidget,
  MentionsWidget,
  TodayPmrWidget,
  LogWidget,
  TrainsWidget,
  type LogDigest,
} from "@/components/ops/dashboard-widgets";
import { ShiftWidget, type QuinyxShift } from "@/components/dashboard/shift-widget";
import { IncidentBanner } from "@/components/dashboard/incident-banner";
import { KpiStrip, NextPickups, TodoQueue, todoItems } from "@/components/dashboard/todo";
import type { Incident } from "@/lib/ops/incident";
import { ModuleTabs } from "@/components/shell/module-tabs";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge, statusColor } from "@/components/ui/status-badge";
import { ListCard } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { WidgetEditor } from "@/components/dashboard/widget-editor";
import {
  DEFAULT_LAYOUT,
  isWide,
  type DashboardLayout,
  type WidgetId,
} from "@/design/dashboard-layout";
import { useStaggerIn } from "@/lib/motion-core";
import { brusselsDay, daysBetween, formatDay, isValidDay } from "@/lib/orders/time";
import { cn, pl } from "@/lib/utils";
import type { FavoriteStation } from "@/lib/ops/irail";
import { serviceLabel, type ShiftChoice } from "@/lib/shift";
import type { DashboardStats } from "@/server/data/dashboard";
import type { ImpactedMission, TodayPmr } from "@/server/data/impacts";
import type { Notification } from "@/server/data/ops";

import { saveDashboardLayout } from "../dashboard-actions";
import { LiveRefresh } from "./commandes/live-refresh";

// Largeur par défaut : `DEFAULT_WIDE` (design/dashboard-layout.ts), modifiable dans « Personnaliser ».
const TITLES: Record<WidgetId, { eyebrow: string; title: string }> = {
  service: { eyebrow: "Mon service", title: "Fin de service" },
  commandes: { eyebrow: "Bus et taxis", title: "Vue du jour" },
  impacts: { eyebrow: "PMR et groupes", title: "Missions impactées" },
  "pmr-jour": { eyebrow: "PMR et groupes", title: "Aujourd'hui en PMR" },
  mentions: { eyebrow: "Pour toi", title: "Mentions et alertes" },
  "a-confirmer": { eyebrow: "Bus et taxis", title: "À envoyer" },
  raccourcis: { eyebrow: "Actions", title: "Raccourcis" },
  trains: { eyebrow: "Opérations", title: "Trains perturbés" },
  "main-courante": { eyebrow: "Opérations", title: "Journal" },
  perturbations: { eyebrow: "Opérations", title: "Perturbations" },
  travaux: { eyebrow: "Opérations", title: "Travaux" },
};

const dateLabel = new Intl.DateTimeFormat("fr-BE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Brussels",
});

export type OpsDigest = {
  log: LogDigest[] | null;
  favorites: FavoriteStation[] | null;
  impacts: ImpactedMission[] | null;
  today: TodayPmr | null;
  mentions: Notification[] | null;
  shift: ShiftChoice | null;
  quinyx: QuinyxShift | null;
  /** Heure du rendu serveur (ms), premier rendu du widget « Fin de service » identique serveur / client. */
  renderedAt: number;
};

function WidgetBody({
  id,
  stats,
  ops,
}: {
  id: WidgetId;
  stats: DashboardStats | null;
  ops: OpsDigest;
}) {
  const { actions } = useShell();
  const router = useRouter();
  switch (id) {
    case "service":
      return <ShiftWidget initial={ops.shift} quinyx={ops.quinyx} renderedAt={ops.renderedAt} />;
    case "commandes":
      if (!stats)
        return (
          <EmptyState title="Accès restreint" description="Tu n'as pas accès aux commandes bus." />
        );
      return (
        <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
          <StatCard
            label="Actives"
            value={stats.active}
            tone="accent"
            onClick={() => router.push("/commandes")}
          />
          <StatCard
            label="À envoyer"
            value={stats.toSend}
            tone="warn"
            onClick={() => router.push("/commandes?statut=termine")}
          />
          <StatCard label="Aujourd'hui" value={stats.today} tone="info" />
          <StatCard
            label="En cours"
            value={stats.running}
            tone="ok"
            onClick={() => router.push("/commandes?statut=brouillon")}
          />
        </div>
      );
    case "a-confirmer":
      if (!stats) return <EmptyState title="Accès restreint" />;
      if (stats.pending.length === 0)
        return (
          <EmptyState title="Rien à envoyer" description="Aucun bon terminé en attente d'envoi." />
        );
      return (
        <div className="flex flex-col gap-2">
          <ul className="grid gap-2 @3xl:grid-cols-2">
            {stats.pending.map((o) => {
              // Jour de service et retard de confirmation (audit UX du 9 oct. 2026 : heure seule, bons de 200 j).
              const day = o.order_date.slice(0, 10);
              const late = isValidDay(day) ? daysBetween(day, brusselsDay()) : 0;
              return (
                <li key={o.id} className="min-w-0">
                  {/* Lien vers le bon (demande du 9 oct. 2026). */}
                  <Link
                    href={`/commandes/bus/${o.id}`}
                    className="block rounded-box outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <ListCard
                      statusColor={statusColor(o.status)}
                      title={`${o.origin || "?"} → ${o.destination || "?"}`}
                      meta={
                        <>
                          {[isValidDay(day) ? formatDay(day) : "", o.call_time, o.relation]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                          {late > 0 ? (
                            <span className="text-warn">
                              {" "}
                              · il y a {late} {pl(late, "jour")}
                            </span>
                          ) : null}
                        </>
                      }
                      aside={
                        <span className="inline-flex flex-col items-end gap-1">
                          <StatusBadge status={o.status} />
                        </span>
                      }
                      className="hover:bg-surface-2"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link href="/commandes/suivi" className="link self-start text-small">
            Tout le suivi ({stats.toSend} à envoyer)
          </Link>
        </div>
      );
    case "raccourcis":
      if (actions.length === 0)
        return <EmptyState title="Aucune action" description="Ton rôle est en lecture seule." />;
      return (
        <div className="grid gap-2 @md:grid-cols-2">
          {actions.map((a) => (
            <Button
              key={a.href}
              asChild
              className="h-auto min-h-control justify-start py-2 text-left whitespace-normal"
            >
              <Link href={a.href}>
                <a.icon /> {a.label}
              </Link>
            </Button>
          ))}
        </div>
      );
    case "impacts":
      return <ImpactsWidget items={ops.impacts} />;
    case "pmr-jour":
      return <TodayPmrWidget data={ops.today} />;
    case "mentions":
      return <MentionsWidget items={ops.mentions} />;
    case "trains":
      return <TrainsWidget favorites={ops.favorites} />;
    case "main-courante":
      return <LogWidget entries={ops.log} />;
    case "perturbations":
      return <DisturbanceWidget kind="incident" allowed={ops.favorites !== null} />;
    case "travaux":
      return <DisturbanceWidget kind="travaux" allowed={ops.favorites !== null} />;
  }
}

function Widget({ id, wide, children }: { id: WidgetId; wide: boolean; children: ReactNode }) {
  const meta = TITLES[id];
  return (
    <div
      data-stagger
      data-widget={id}
      className={cn(
        "@container min-w-0",
        wide && "md:col-span-2",
        // « Fin de service » est dans la colonne droite de l'accueil dès 1280 px.
        id === "service" && "xl:hidden",
      )}
    >
      <Card className="h-full">
        <CardHeader
          eyebrow={meta.eyebrow}
          title={meta.title}
          actions={
            id === "commandes" || id === "a-confirmer" ? (
              <LiveRefresh quiet topics={["bus_orders"]} />
            ) : id === "impacts" || id === "pmr-jour" ? (
              <LiveRefresh quiet topics={["mission_trains", "pmr_assists"]} />
            ) : id === "mentions" ? (
              <LiveRefresh quiet topics={["notifications"]} />
            ) : null
          }
        />
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

const sameLayout = (a: DashboardLayout, b: DashboardLayout) =>
  JSON.stringify([a.order, a.hidden, a.wide]) === JSON.stringify([b.order, b.hidden, b.wide]);

export function Dashboard({
  firstName,
  stats,
  incident = null,
  ops,
  initialLayout,
}: {
  firstName: string;
  stats: DashboardStats | null;
  /** Incident en cours (bandeau Temps réel, 4 nov. 2026) : `null` quand tout est calme. */
  incident?: Incident | null;
  ops: OpsDigest;
  initialLayout: DashboardLayout;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // `saved` = dernière disposition enregistrée (« Annuler » y revient, même après un premier enregistrement).
  const [saved, setSaved] = useState(initialLayout);
  const [layout, setLayout] = useState(initialLayout);
  const [editing, setEditing] = useState(false);
  const [saving, startSaving] = useTransition();
  const editTitle = useRef<HTMLHeadingElement>(null);
  const customize = useRef<HTMLButtonElement>(null);
  const toggled = useRef(false);
  useStaggerIn(ref);

  // Focus : sur le titre de l'éditeur à l'ouverture, sur « Personnaliser » à la fermeture (jamais au premier rendu).
  useEffect(() => {
    if (!toggled.current) return;
    toggled.current = false;
    (editing ? editTitle.current : customize.current)?.focus();
  }, [editing]);

  const open = () => {
    toggled.current = true;
    setEditing(true);
  };
  const close = () => {
    toggled.current = true;
    setEditing(false);
  };

  const finish = () => {
    if (sameLayout(layout, saved)) return close();
    startSaving(async () => {
      try {
        await saveDashboardLayout(layout);
        setSaved(layout);
        close();
        toast.success("Disposition enregistrée");
      } catch {
        toast.error("Enregistrement impossible", { description: "Réessaie dans un instant." });
      }
    });
  };

  // « Vue du jour » et « À envoyer » sont repris par la bande de compteurs et la file « À traiter » (11 oct. 2026).
  const absorbed = (id: WidgetId) => id === "commandes" || id === "a-confirmer";
  const shown: WidgetId[] = layout.order.filter(
    (id) => !absorbed(id) && !layout.hidden.includes(id),
  );
  const hiddenIds: WidgetId[] = layout.order.filter(
    (id) => !absorbed(id) && layout.hidden.includes(id),
  );
  // Colonne droite (≥ 1280 px) : « Fin de service » si le widget est affiché (il quitte alors la grille à cette largeur),
  // « Prochaines prises en charge » avec le droit des missions.
  const showShift = !layout.hidden.includes("service");
  const aside = showShift || !!ops.today;
  const service = serviceLabel(ops.shift, ops.quinyx);

  return (
    <div
      ref={ref}
      className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 md:px-6 md:py-5"
    >
      {/* Onglets de l'Accueil en mobile (À traiter · Statistiques, navigation v3) ; en desktop, dans la barre du haut. */}
      <div className="md:hidden">
        <ModuleTabs moduleId="accueil" />
      </div>
      {/* En-tête d'une ligne (11 oct. 2026 ; v4 : date + service du jour). */}
      <header className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h1 className="display truncate text-h3 text-fg md:text-h2">
          Bonjour{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-small text-fg-muted first-letter:uppercase" data-testid="today-line">
          {dateLabel.format(new Date())}
          {service ? ` · ${service}` : ""}
        </p>
      </header>
      {incident ? <IncidentBanner incident={incident} /> : null}
      <KpiStrip stats={stats} today={ops.today} impacts={ops.impacts} />
      {/* File « À traiter » ; dès 1280 px, colonne droite « Fin de service » + « Prochaines prises en charge »
          (v4, lot 4). Les widgets restent personnalisables en dessous. */}
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start xl:gap-5">
        <TodoQueue
          items={todoItems({
            stats,
            impacts: ops.impacts,
            mentions: ops.mentions,
            log: ops.log,
          })}
        />
        {aside ? (
          <aside
            className="hidden flex-col gap-4 xl:flex"
            aria-label="Mon service et prochaines prises en charge"
            data-testid="home-aside"
          >
            {showShift ? (
              <Card className="min-w-0">
                <CardHeader title="Fin de service" />
                <CardContent className="pt-3">
                  <ShiftWidget
                    initial={ops.shift}
                    quinyx={ops.quinyx}
                    renderedAt={ops.renderedAt}
                  />
                </CardContent>
              </Card>
            ) : null}
            {ops.today ? <NextPickups data={ops.today} /> : null}
          </aside>
        ) : null}
      </div>
      {/* Widgets (4 nov. 2026) : la personnalisation se fait sur place, au-dessus de la grille qu'elle modifie. */}
      <section
        aria-labelledby="widgets-title"
        className={cn(
          "flex flex-col gap-3",
          editing && "rounded-box border border-border-strong bg-surface-2 p-3 md:p-4",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2
              id="widgets-title"
              ref={editTitle}
              tabIndex={-1}
              className="text-panel font-semibold text-fg outline-none"
            >
              {editing ? "Personnaliser les widgets" : "Mes widgets"}
            </h2>
            {editing ? (
              <p className="text-small text-fg-muted" role="status">
                Glisse une ligne (appui long au doigt) ou utilise les flèches. Enregistré quand tu
                cliques sur Terminé.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {editing ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setLayout(DEFAULT_LAYOUT)}
                  disabled={sameLayout(layout, DEFAULT_LAYOUT)}
                >
                  <RotateCcw /> Par défaut
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setLayout(saved);
                    close();
                  }}
                >
                  Annuler
                </Button>
                <Button variant="primary" loading={saving} onClick={finish}>
                  <Check /> Terminé
                </Button>
              </>
            ) : (
              <Button ref={customize} onClick={open}>
                <SlidersHorizontal /> Personnaliser
              </Button>
            )}
          </div>
        </div>
        {editing ? (
          <WidgetEditor
            layout={layout}
            visible={shown}
            hidden={hiddenIds}
            meta={(id) => ({
              ...TITLES[id],
              note:
                id === "service"
                  ? "Sur grand écran, affiché dans la colonne de droite."
                  : undefined,
            })}
            onChange={setLayout}
          />
        ) : shown.length === 0 ? (
          <EmptyState
            title="Aucun widget affiché"
            description="Clique sur Personnaliser pour en ajouter."
          />
        ) : (
          <div
            className="grid grid-flow-row-dense grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3"
            data-testid="dashboard-grid"
            data-compact-empty
          >
            {shown.map((id) => (
              <Widget key={id} id={id} wide={isWide(layout, id)}>
                <WidgetBody id={id} stats={stats} ops={ops} />
              </Widget>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
