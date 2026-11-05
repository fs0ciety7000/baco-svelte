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
} from "@dnd-kit/core";
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, EyeOff, GripVertical, MoveDiagonal2, Plus } from "lucide-react";
import {
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";

import { Button } from "@/components/ui/button";
import {
  reorder,
  resizeBy,
  setHidden,
  setSize,
  sizeOf,
  spanOf,
  step,
  type DashboardLayout,
  type WidgetId,
  type WidgetSize,
} from "@/design/dashboard-layout";
import { NO_MOTION } from "@/lib/motion-core";
import { cn } from "@/lib/utils";

// Mode « Personnaliser » de Temps réel. 4 nov. 2026 : liste de lignes ; 5 nov. 2026 (retour : « pas content de
// l'organisation / resize / position ») : la vraie grille, chaque widget se déplace (glisser, ou Monter / Descendre) et se
// redimensionne à la souris par sa poignée en bas à droite (flèches au clavier), cases magnétiques de la grille
// (`resizeBy`, `globals.css` `.dash-grid`). Les masqués sont listés à part avec « Afficher ».

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

/** Un clic sur un bouton du widget ne démarre jamais un glisser. */
const stop = (e: SyntheticEvent) => e.stopPropagation();

/** Variables CSS de placement d'un widget dans `.dash-grid` (12 colonnes, 6 colonnes, rangées). */
export function gridVars(size: WidgetSize): CSSProperties {
  return {
    "--w-xl": spanOf(size, 12),
    "--w-md": spanOf(size, 6),
    "--h": size.h,
  } as CSSProperties;
}

/** Mesures de la grille affichée : colonnes (12 ou 6) et pas d'une colonne / d'une rangée, écart compris. */
function gridMetrics(el: Element | null) {
  const grid = el?.closest(".dash-grid");
  if (!grid) return null;
  const css = getComputedStyle(grid);
  const cols = css.gridTemplateColumns.split(" ").filter(Boolean).length >= 12 ? 12 : 6;
  const gap = parseFloat(css.columnGap) || 16;
  const rowGap = parseFloat(css.rowGap) || gap;
  const row = parseFloat(css.gridAutoRows) || 40;
  const width = grid.getBoundingClientRect().width;
  return {
    cols: cols as 6 | 12,
    colPx: (width + gap) / cols,
    rowPx: row + rowGap,
  };
}

function sizeText(size: WidgetSize) {
  return `${size.w} colonne${size.w > 1 ? "s" : ""} sur 12, ${size.h} rangées`;
}

function EditTile({
  id,
  meta,
  index,
  count,
  size,
  reduced,
  preview,
  onStep,
  onHide,
  onResizeStart,
  onResize,
  onResizeKey,
}: {
  id: WidgetId;
  meta: WidgetMeta;
  index: number;
  count: number;
  size: WidgetSize;
  reduced: boolean;
  preview?: ReactNode;
  onStep: (id: WidgetId, dir: -1 | 1) => void;
  onHide: (id: WidgetId) => void;
  onResizeStart: () => void;
  onResize: (id: WidgetId, dx: number, dy: number, el: Element) => void;
  onResizeKey: (id: WidgetId, e: ReactKeyboardEvent<HTMLButtonElement>) => void;
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
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [resizing, setResizing] = useState(false);

  const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
    setResizing(true);
    onResizeStart();
  };
  const moveTo = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return;
    onResize(id, e.clientX - drag.current.x, e.clientY - drag.current.y, e.currentTarget);
  };
  const up = () => {
    drag.current = null;
    setResizing(false);
  };

  return (
    <li
      ref={setNodeRef}
      data-widget-row={id}
      // Le widget entier se saisit (souris : après 4 px ; doigt : appui long) ; le clavier passe par la poignée.
      {...listeners}
      style={{
        ...gridVars(size),
        transform: CSS.Translate.toString(transform),
        transition: transition ?? undefined,
      }}
      className={cn(
        "dash-item relative flex min-h-24 min-w-0 cursor-grab touch-manipulation flex-col overflow-hidden rounded-box border border-border-strong bg-surface shadow-rest select-none [-webkit-touch-callout:none]",
        isDragging && "border-dashed bg-surface-2 opacity-50 shadow-none",
        resizing && "ring-2 ring-accent",
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 border-b border-border py-1 pr-1 pl-1">
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
        <span
          aria-hidden
          className="figures grid size-6 shrink-0 place-items-center rounded-pill bg-surface-2 text-small text-fg-muted"
        >
          {index + 1}
        </span>
        <span className="flex min-w-0 flex-1 basis-32 flex-col leading-tight">
          <span className="truncate text-label text-fg-muted">{meta.eyebrow}</span>
          <span className="truncate text-small font-medium text-fg">{meta.title}</span>
        </span>
        <div className="ml-auto flex shrink-0 items-center" onMouseDown={stop} onTouchStart={stop}>
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
      </div>
      {/* Aperçu du vrai contenu, inerte (ni clic ni focus) et estompé. */}
      <div
        inert
        aria-hidden
        className="relative max-h-40 min-h-0 flex-1 overflow-hidden px-3 py-2 opacity-60 md:max-h-none"
      >
        {preview}
      </div>
      <span
        className="pointer-events-none absolute bottom-1.5 left-2 hidden rounded-pill bg-surface-2 px-2 py-0.5 text-label text-fg-muted tabular md:inline"
        data-testid="widget-size"
      >
        {size.w} × {size.h}
      </span>
      {/* Poignée de redimensionnement : souris (glisser) et clavier (flèches), à partir de 768 px. */}
      <button
        type="button"
        aria-label={`Redimensionner « ${meta.title} » : ${sizeText(size)}. Flèches gauche et droite pour la largeur, haut et bas pour la hauteur.`}
        data-resize={id}
        onPointerDown={down}
        onPointerMove={moveTo}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={(e) => onResizeKey(id, e)}
        onMouseDown={stop}
        onTouchStart={stop}
        className="absolute right-0.5 bottom-0.5 hidden size-8 cursor-nwse-resize touch-none place-items-center rounded-control bg-surface text-fg-muted outline-none hover:bg-surface-3 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent md:grid"
      >
        <MoveDiagonal2 className="size-4" aria-hidden />
      </button>
    </li>
  );
}

export function WidgetEditor({
  layout,
  visible,
  hidden,
  meta,
  preview,
  onChange,
}: {
  layout: DashboardLayout;
  /** Widgets affichés, dans l'ordre. */
  visible: WidgetId[];
  /** Widgets masqués (dans l'ordre enregistré). */
  hidden: WidgetId[];
  meta: (id: WidgetId) => WidgetMeta;
  /** Aperçu (inerte) du contenu d'un widget dans la grille d'édition. */
  preview?: (id: WidgetId) => ReactNode;
  onChange: (layout: DashboardLayout) => void;
}) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState<WidgetId | null>(null);
  // Disposition au début d'un redimensionnement : chaque mouvement repart d'elle (pas d'erreur cumulée).
  const base = useRef(layout);
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
        : `« ${name(a.id)} » hors de la grille.`,
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

  const onResize = (id: WidgetId, dx: number, dy: number, el: Element) => {
    const grid = gridMetrics(el);
    if (!grid) return;
    const next = resizeBy(sizeOf(base.current, id), dx, dy, grid);
    const now = sizeOf(layout, id);
    if (next.w !== now.w || next.h !== now.h) onChange(setSize(base.current, id, next));
  };

  // Clavier : ← → largeur (une colonne de la grille affichée), ↑ ↓ hauteur (une rangée).
  const onResizeKey = (id: WidgetId, e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const grid = gridMetrics(e.currentTarget);
    if (!grid) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
      e.key
    ] as [number, number] | undefined;
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    onChange(
      setSize(layout, id, resizeBy(sizeOf(layout, id), d[0] * grid.colPx, d[1] * grid.rowPx, grid)),
    );
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
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActive(null)}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "Pour déplacer un widget, appuie sur Espace, change sa place avec les flèches, puis appuie sur Espace pour le poser. Échap annule.",
          },
        }}
      >
        <SortableContext items={visible} strategy={rectSortingStrategy}>
          <ol className="dash-grid relative" aria-label="Widgets affichés">
            {visible.map((id, i) => (
              <EditTile
                key={id}
                id={id}
                meta={meta(id)}
                index={i}
                count={visible.length}
                size={sizeOf(layout, id)}
                reduced={reduced}
                preview={preview?.(id)}
                onStep={onStep}
                onHide={(w) => onChange(setHidden(layout, w, true))}
                onResizeStart={() => {
                  base.current = layout;
                }}
                onResize={onResize}
                onResizeKey={onResizeKey}
              />
            ))}
          </ol>
        </SortableContext>
        <DragOverlay dropAnimation={reduced ? null : { duration: 200, easing: EASE }}>
          {active ? (
            <div className="flex min-h-14 cursor-grabbing items-center gap-2 rounded-box border border-border-strong bg-surface px-2 shadow-float">
              <GripVertical className="size-5 text-fg" aria-hidden />
              <span className="truncate font-medium text-fg">{meta(active).title}</span>
            </div>
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
