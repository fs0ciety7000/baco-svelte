"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, EyeOff, GripVertical, Plus } from "lucide-react";
import {
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
  type SyntheticEvent,
} from "react";

import { Button } from "@/components/ui/button";
import {
  isWide,
  reorder,
  setHidden,
  setWide,
  step,
  type DashboardLayout,
  type WidgetId,
} from "@/design/dashboard-layout";
import { NO_MOTION } from "@/lib/motion-core";
import { cn } from "@/lib/utils";

// Mode « Personnaliser » de Temps réel (4 nov. 2026) : les widgets deviennent une liste de lignes de même hauteur
// (glisser vertical sans saut, Monter / Descendre sans ambiguïté), les masqués sont listés à part avec « Afficher ».

export type WidgetMeta = { eyebrow: string; title: string; note?: string };

const EASE = "cubic-bezier(0.2, 0, 0, 1)";

function subscribeMotion(onChange: () => void) {
  const mq = window.matchMedia(NO_MOTION);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** `prefers-reduced-motion: reduce` (faux au rendu serveur). */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(NO_MOTION).matches,
    () => false,
  );
}

/** Glisser vertical seulement : la liste est une colonne. */
const lockX: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/** Un clic sur un bouton de la ligne ne démarre jamais un glisser. */
const stop = (e: SyntheticEvent) => e.stopPropagation();

function RowFrame({
  className,
  children,
  ...props
}: ComponentProps<"li"> & { children: ReactNode }) {
  return (
    <li
      className={cn(
        "flex min-h-14 min-w-0 items-center gap-2 rounded-box border border-border bg-surface py-1.5 pr-1.5 pl-1 shadow-rest",
        className,
      )}
      {...props}
    >
      {children}
    </li>
  );
}

function RowLabel({ meta, index }: { meta: WidgetMeta; index: number }) {
  return (
    <>
      <span
        aria-hidden
        className="figures grid size-6 shrink-0 place-items-center rounded-pill bg-surface-2 text-small text-fg-muted"
      >
        {index + 1}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-small text-fg-muted">{meta.eyebrow}</span>
        <span className="truncate font-medium text-fg">{meta.title}</span>
        {meta.note ? (
          <span className="hidden text-small text-fg-subtle xl:block">{meta.note}</span>
        ) : null}
      </span>
    </>
  );
}

function SortableRow({
  id,
  meta,
  index,
  count,
  wide,
  reduced,
  onStep,
  onHide,
  onWide,
}: {
  id: WidgetId;
  meta: WidgetMeta;
  index: number;
  count: number;
  wide: boolean;
  reduced: boolean;
  onStep: (id: WidgetId, dir: -1 | 1) => void;
  onHide: (id: WidgetId) => void;
  onWide: (id: WidgetId, wide: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, transition: reduced ? null : { duration: 200, easing: EASE } });
  return (
    <RowFrame
      ref={setNodeRef}
      data-widget-row={id}
      // Toute la ligne se saisit (souris : après 4 px ; doigt : appui long) ; le clavier passe par la poignée.
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform), transition: transition ?? undefined }}
      className={cn(
        "cursor-grab touch-manipulation select-none [-webkit-touch-callout:none]",
        isDragging && "border-dashed border-border-strong bg-surface-2 opacity-50 shadow-none",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        aria-label={`Déplacer « ${meta.title} »`}
        aria-roledescription="widget déplaçable"
        className="grid size-control shrink-0 cursor-grab touch-none place-items-center rounded-control text-fg-muted outline-none hover:bg-surface-3 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing"
      >
        <GripVertical className="size-5" aria-hidden />
      </button>
      <RowLabel meta={meta} index={index} />
      <div className="flex shrink-0 items-center gap-0.5" onMouseDown={stop} onTouchStart={stop}>
        <Button
          size="sm"
          variant="ghost"
          className="hidden md:inline-flex"
          aria-pressed={wide}
          aria-label={`Largeur de « ${meta.title} » : ${wide ? "double" : "simple"}`}
          onClick={() => onWide(id, !wide)}
        >
          {wide ? "Large" : "Normal"}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          data-move="up"
          aria-label={`Monter « ${meta.title} »`}
          disabled={index === 0}
          onClick={() => onStep(id, -1)}
        >
          <ArrowUp />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          data-move="down"
          aria-label={`Descendre « ${meta.title} »`}
          disabled={index === count - 1}
          onClick={() => onStep(id, 1)}
        >
          <ArrowDown />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Masquer « ${meta.title} »`}
          onClick={() => onHide(id)}
        >
          <EyeOff />
        </Button>
      </div>
    </RowFrame>
  );
}

export function WidgetEditor({
  layout,
  visible,
  hidden,
  meta,
  onChange,
}: {
  layout: DashboardLayout;
  /** Widgets affichés, dans l'ordre. */
  visible: WidgetId[];
  /** Widgets masqués (dans l'ordre enregistré). */
  hidden: WidgetId[];
  meta: (id: WidgetId) => WidgetMeta;
  onChange: (layout: DashboardLayout) => void;
}) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState<WidgetId | null>(null);
  const sensors = useSensors(
    // Souris : 4 px avant de saisir (un clic reste un clic) ; doigt : appui de 200 ms, le défilement reste libre.
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const name = (id: unknown) => meta(id as WidgetId).title;
  const position = (id: unknown) => visible.indexOf(id as WidgetId) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active: a }) =>
      `« ${name(a.id)} » saisi, position ${position(a.id)} sur ${visible.length}.`,
    onDragOver: ({ active: a, over }) =>
      over
        ? `« ${name(a.id)} » en position ${position(over.id)} sur ${visible.length}.`
        : `« ${name(a.id)} » hors de la liste.`,
    onDragEnd: ({ active: a, over }) =>
      over
        ? `« ${name(a.id)} » posé en position ${position(over.id)} sur ${visible.length}.`
        : `« ${name(a.id)} » reposé à sa place.`,
    onDragCancel: ({ active: a }) => `Déplacement annulé, « ${name(a.id)} » reste à sa place.`,
  };

  const onStep = (id: WidgetId, dir: -1 | 1) => {
    onChange(step(layout, visible, id, dir));
    // Le bouton cliqué suit le widget (React peut déplacer son nœud et lui faire perdre le focus).
    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`[data-widget-row="${id}"]`);
      const wanted = row?.querySelector<HTMLButtonElement>(
        `[data-move="${dir < 0 ? "up" : "down"}"]`,
      );
      const other = row?.querySelector<HTMLButtonElement>(
        `[data-move="${dir < 0 ? "down" : "up"}"]`,
      );
      (wanted && !wanted.disabled ? wanted : other)?.focus();
    });
  };

  const onDragStart = ({ active: a }: DragStartEvent) => setActive(a.id as WidgetId);
  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    setActive(null);
    if (over && a.id !== over.id)
      onChange(reorder(layout, visible, a.id as WidgetId, over.id as WidgetId));
  };

  return (
    <div className="flex flex-col gap-4" data-testid="dashboard-editor">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[lockX]}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActive(null)}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "Pour déplacer un widget, appuie sur Espace, change sa place avec les flèches haut et bas, puis appuie sur Espace pour le poser. Échap annule.",
          },
        }}
      >
        <SortableContext items={visible} strategy={verticalListSortingStrategy}>
          <ol className="relative flex flex-col gap-2" aria-label="Widgets affichés">
            {visible.map((id, i) => (
              <SortableRow
                key={id}
                id={id}
                meta={meta(id)}
                index={i}
                count={visible.length}
                wide={isWide(layout, id)}
                reduced={reduced}
                onStep={onStep}
                onHide={(w) => onChange(setHidden(layout, w, true))}
                onWide={(w, wide) => onChange(setWide(layout, w, wide))}
              />
            ))}
          </ol>
        </SortableContext>
        <DragOverlay dropAnimation={reduced ? null : { duration: 200, easing: EASE }}>
          {active ? (
            <ol aria-hidden>
              <RowFrame className="cursor-grabbing border-border-strong shadow-float">
                <span className="grid size-control shrink-0 place-items-center text-fg">
                  <GripVertical className="size-5" />
                </span>
                <RowLabel meta={meta(active)} index={visible.indexOf(active)} />
              </RowFrame>
            </ol>
          ) : null}
        </DragOverlay>
      </DndContext>
      {visible.length === 0 ? (
        <p className="text-body text-fg-muted">Aucun widget affiché : ajoute-en un ci-dessous.</p>
      ) : null}

      <section aria-labelledby="hidden-widgets" className="flex flex-col gap-2">
        <h3 id="hidden-widgets" className="text-small font-medium text-fg-muted">
          Widgets masqués{hidden.length ? ` (${hidden.length})` : ""}
        </h3>
        {hidden.length === 0 ? (
          <p className="text-small text-fg-subtle">Aucun : tous les widgets sont affichés.</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3" data-testid="hidden-widgets">
            {hidden.map((id) => (
              <li
                key={id}
                data-widget-hidden={id}
                className="flex min-w-0 items-center gap-2 rounded-box border border-dashed border-border-strong py-1.5 pr-1.5 pl-3"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-small text-fg-muted">{meta(id).eyebrow}</span>
                  <span className="truncate text-fg">{meta(id).title}</span>
                </span>
                <Button
                  size="sm"
                  aria-label={`Afficher « ${meta(id).title} »`}
                  onClick={() => onChange(setHidden(layout, id, false))}
                >
                  <Plus /> Afficher
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
