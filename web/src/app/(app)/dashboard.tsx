"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";

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
import { KpiStrip, NextPickups, TodoQueue, todoItems } from "@/components/dashboard/todo";
import { ModuleTabs } from "@/components/shell/module-tabs";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge, statusColor } from "@/components/ui/status-badge";
import { ListCard } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { type DashboardLayout, type WidgetId } from "@/design/dashboard-layout";
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

const TITLES: Record<WidgetId, { eyebrow: string; title: string; wide?: boolean }> = {
  service: { eyebrow: "Mon service", title: "Fin de service" },
  commandes: { eyebrow: "Commandes", title: "Vue du jour", wide: true },
  impacts: { eyebrow: "PMR et groupes", title: "Missions impactées", wide: true },
  "pmr-jour": { eyebrow: "PMR et groupes", title: "Aujourd'hui en PMR" },
  mentions: { eyebrow: "Pour toi", title: "Mentions et alertes" },
  "a-confirmer": { eyebrow: "Commandes", title: "À envoyer", wide: true },
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

function Widget({
  id,
  index,
  count,
  editing,
  hidden,
  layout,
  onLayout,
  onMove,
  children,
}: {
  id: WidgetId;
  index: number;
  count: number;
  editing: boolean;
  hidden: boolean;
  layout: DashboardLayout;
  onLayout: (l: DashboardLayout) => void;
  onMove: (id: WidgetId, dir: -1 | 1) => void;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled: !editing,
  });
  const meta = TITLES[id];
  return (
    <div
      ref={setNodeRef}
      data-stagger
      data-widget={id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "@container min-w-0",
        meta.wide && "md:col-span-2",
        // « Fin de service » est dans la colonne droite de l'accueil dès 1280 px (hors personnalisation).
        id === "service" && !editing && "xl:hidden",
        isDragging && "z-10 opacity-80",
        hidden && "opacity-50",
      )}
    >
      <Card className={cn("h-full", editing && "[--frame:var(--border-strong)]")}>
        <CardHeader
          eyebrow={meta.eyebrow}
          title={meta.title}
          actions={
            editing ? (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Monter « ${meta.title} »`}
                  disabled={index === 0}
                  onClick={() => onMove(id, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Descendre « ${meta.title} »`}
                  disabled={index === count - 1}
                  onClick={() => onMove(id, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={hidden ? `Afficher « ${meta.title} »` : `Masquer « ${meta.title} »`}
                  aria-pressed={hidden}
                  onClick={() =>
                    onLayout({
                      ...layout,
                      hidden: hidden
                        ? layout.hidden.filter((h) => h !== id)
                        : [...layout.hidden, id],
                    })
                  }
                >
                  {hidden ? <EyeOff /> : <Eye />}
                </Button>
                <Button
                  ref={setActivatorNodeRef}
                  size="icon"
                  variant="ghost"
                  className="cursor-grab touch-none active:cursor-grabbing"
                  aria-label={`Déplacer « ${meta.title} » (glisser, ou Espace puis flèches)`}
                  {...attributes}
                  {...listeners}
                >
                  <GripVertical />
                </Button>
              </>
            ) : id === "commandes" || id === "a-confirmer" ? (
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

export function Dashboard({
  firstName,
  stats,
  ops,
  initialLayout,
}: {
  firstName: string;
  stats: DashboardStats | null;
  ops: OpsDigest;
  initialLayout: DashboardLayout;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState(initialLayout);
  const [editing, setEditing] = useState(false);
  const [saving, startSaving] = useTransition();
  useStaggerIn(ref);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = layout.order.indexOf(active.id as WidgetId);
    const to = layout.order.indexOf(over.id as WidgetId);
    setLayout({ ...layout, order: arrayMove(layout.order, from, to) });
  };

  const finish = () =>
    startSaving(async () => {
      try {
        await saveDashboardLayout(layout);
        setEditing(false);
        toast.success("Disposition enregistrée");
      } catch {
        toast.error("Enregistrement impossible", { description: "Réessaie dans un instant." });
      }
    });

  // « Vue du jour » et « À envoyer » sont repris par la bande de compteurs et la file « À traiter » (11 oct. 2026).
  const absorbed = (id: WidgetId) => id === "commandes" || id === "a-confirmer";
  const shown: WidgetId[] = (
    editing ? layout.order : layout.order.filter((id) => !layout.hidden.includes(id))
  ).filter((id) => !absorbed(id));
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
      {/* En-tête d'une ligne (11 oct. 2026 ; v4 : date + service du jour) : salutation, personnalisation. */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1 className="display truncate text-h3 text-fg md:text-h2">
            Bonjour{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-small text-fg-muted first-letter:uppercase" data-testid="today-line">
            {dateLabel.format(new Date())}
            {service ? ` · ${service}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setLayout(initialLayout);
                  setEditing(false);
                }}
              >
                Annuler
              </Button>
              <Button variant="primary" loading={saving} onClick={finish}>
                Terminer
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setEditing(true)}>
              <SlidersHorizontal /> Personnaliser
            </Button>
          )}
        </div>
      </header>
      {!editing ? (
        <>
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
        </>
      ) : null}
      {editing ? (
        <p className="text-body text-fg-muted" role="status">
          Glisse les widgets par la poignée, ou utilise les flèches. L&apos;œil masque un widget.
        </p>
      ) : null}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={shown} strategy={rectSortingStrategy}>
          <div
            className="grid grid-flow-row-dense grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3"
            data-testid="dashboard-grid"
            data-compact-empty
          >
            {shown.map((id, i) => (
              <Widget
                key={id}
                id={id}
                index={i}
                count={shown.length}
                editing={editing}
                hidden={layout.hidden.includes(id)}
                layout={layout}
                onLayout={setLayout}
                onMove={(wid, dir) => {
                  // Échange avec le voisin AFFICHÉ (les widgets repris par l'accueil restent dans l'ordre enregistré).
                  const j = shown.indexOf(wid) + dir;
                  const other = shown[j];
                  if (!other) return;
                  const order = [...layout.order];
                  const a = order.indexOf(wid);
                  const b = order.indexOf(other);
                  [order[a], order[b]] = [order[b]!, order[a]!];
                  setLayout({ ...layout, order });
                }}
              >
                <WidgetBody id={id} stats={stats} ops={ops} />
              </Widget>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
