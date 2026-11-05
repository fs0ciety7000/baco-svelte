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
import { KpiStrip, NextPickupsList, todoItems } from "@/components/dashboard/todo";
import { TodoQueue } from "@/components/dashboard/todo-queue";
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
import { gridVars, WidgetEditor } from "@/components/dashboard/widget-editor";
import {
  DEFAULT_LAYOUT,
  setHidden,
  sizeOf,
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
  prochaines: { eyebrow: "PMR et groupes", title: "Prochaines prises en charge" },
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
  /** Clés « vu » de la file « À traiter » (`preferences.todoSeen`, 4 nov. 2026). */
  todoSeen?: string[];
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
    case "prochaines":
      return ops.today ? (
        <NextPickupsList data={ops.today} max={12} />
      ) : (
        <EmptyState title="Accès restreint" description="Tu n'as pas accès aux missions PMR." />
      );
  }
}

function Widget({
  id,
  layout,
  children,
}: {
  id: WidgetId;
  layout: DashboardLayout;
  children: ReactNode;
}) {
  const meta = TITLES[id];
  return (
    <div
      data-stagger
      data-widget={id}
      // Taille choisie dans « Personnaliser » (5 nov. 2026) : colonnes et rangées de `.dash-grid` ; contenu plus haut que
      // le widget = défilement dans le widget (positionné : voir CLAUDE.md, conteneur à défilement interne).
      style={gridVars(sizeOf(layout, id))}
      className="dash-item @container min-w-0"
    >
      <Card className="flex h-full flex-col">
        <CardHeader
          eyebrow={meta.eyebrow}
          title={meta.title}
          actions={
            id === "commandes" || id === "a-confirmer" ? (
              <LiveRefresh quiet topics={["bus_orders"]} />
            ) : id === "impacts" || id === "pmr-jour" || id === "prochaines" ? (
              <LiveRefresh quiet topics={["mission_trains", "pmr_assists"]} />
            ) : id === "mentions" ? (
              <LiveRefresh quiet topics={["notifications"]} />
            ) : null
          }
        />
        <CardContent className="relative min-h-0 flex-1 md:overflow-y-auto">{children}</CardContent>
      </Card>
    </div>
  );
}

const sameLayout = (a: DashboardLayout, b: DashboardLayout) =>
  JSON.stringify([a.order, a.hidden, a.wide, a.sizes ?? null]) ===
  JSON.stringify([b.order, b.hidden, b.wide, b.sizes ?? null]);

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

  // « Vue du jour » et « À envoyer » sont repris par la bande de compteurs et la file « À traiter » (11 oct. 2026) ;
  // « Fin de service » est le bandeau en tête (5 nov. 2026), masquable dans « Personnaliser ».
  const absorbed = (id: WidgetId) => id === "commandes" || id === "a-confirmer" || id === "service";
  const shown: WidgetId[] = layout.order.filter(
    (id) => !absorbed(id) && !layout.hidden.includes(id),
  );
  const hiddenIds: WidgetId[] = layout.order.filter(
    (id) => !absorbed(id) && layout.hidden.includes(id),
  );
  const showShift = !layout.hidden.includes("service");
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
      {/* « Fin de service » en bandeau pleine largeur (5 nov. 2026 : l'ancienne colonne de droite est supprimée). */}
      {showShift ? (
        <ShiftWidget
          variant="banner"
          initial={ops.shift}
          quinyx={ops.quinyx}
          renderedAt={ops.renderedAt}
        />
      ) : null}
      {incident ? <IncidentBanner incident={incident} /> : null}
      <KpiStrip stats={stats} today={ops.today} impacts={ops.impacts} seen={ops.todoSeen} />
      <TodoQueue
        items={todoItems({
          stats,
          impacts: ops.impacts,
          mentions: ops.mentions,
          log: ops.log,
        })}
        seen={ops.todoSeen ?? []}
      />
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
                Glisse un widget pour le déplacer (appui long au doigt), tire sa poignée en bas à
                droite pour l&apos;agrandir ou le réduire. Enregistré quand tu cliques sur Terminé.
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
          <>
            <WidgetEditor
              layout={layout}
              visible={shown}
              hidden={hiddenIds}
              meta={(id) => TITLES[id]}
              preview={(id) => <WidgetBody id={id} stats={stats} ops={ops} />}
              onChange={setLayout}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-box border border-dashed border-border-strong py-1.5 pr-1.5 pl-3">
              <span className="min-w-0 text-small">
                <span className="font-medium text-fg">Bandeau « Fin de service »</span>
                <span className="text-fg-muted"> · en tête de la page</span>
              </span>
              <Button
                size="sm"
                data-testid="toggle-shift-banner"
                aria-pressed={showShift}
                onClick={() => setLayout(setHidden(layout, "service", showShift))}
              >
                {showShift ? "Masquer" : "Afficher"}
              </Button>
            </div>
          </>
        ) : shown.length === 0 ? (
          <EmptyState
            title="Aucun widget affiché"
            description="Clique sur Personnaliser pour en ajouter."
          />
        ) : (
          <div className="dash-grid" data-testid="dashboard-grid" data-compact-empty>
            {shown.map((id) => (
              <Widget key={id} id={id} layout={layout}>
                <WidgetBody id={id} stats={stats} ops={ops} />
              </Widget>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
