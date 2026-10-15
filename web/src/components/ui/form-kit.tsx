"use client";

import { Check, ChevronDown, CloudOff, Loader2, TriangleAlert } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

import { CHIP_BASE, CHIP_OFF, CHIP_ON } from "./chip-styles";
import { useFormBridge } from "./form-bridge";

// Briques des formulaires de commande (audit UX §5) : contrôle segmenté, section repliable avec résumé,
// barre d'actions collante, indicateur d'enregistrement automatique, historique horodaté.

/** Faut-il passer en grille ? Largeur naturelle (libellés sur une ligne) plus grande que la place disponible. */
export function segmentedNeedsWrap(natural: number, available: number): boolean {
  return available > 0 && natural > available + 1;
}

const SEGMENT_TEXT = "px-2 text-small font-medium sm:px-3";

/**
 * Contrôle segmenté (2 à 4 options) : radiogroup, flèches du clavier, pleine largeur sur mobile. Quand une option ne
 * tient pas sur la ligne (« Modif. service planifié » en 390 px), il passe en **grille de 2 colonnes** et les libellés
 * vont à la ligne au lieu d'être coupés (mesure d'une rangée invisible, ResizeObserver). Contrôlé (`value` +
 * `onChange`) ou non (`defaultValue`) ; avec `name`, la valeur part dans un champ caché (formulaires GET, `FilterForm` :
 * `change` émis à chaque choix de l'agent, comme les listes personnalisées).
 */
function Segmented<T extends string | number>({
  value: valueProp,
  defaultValue,
  onChange,
  options,
  label,
  name,
  disabled,
  className,
}: {
  value?: T;
  defaultValue?: T;
  onChange?: (v: T) => void;
  options: readonly { value: T; label: string }[];
  label: string;
  name?: string;
  disabled?: boolean;
  className?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const measureRef = React.useRef<HTMLDivElement>(null);
  const [inner, setInner] = React.useState<T | undefined>(defaultValue ?? options[0]?.value);
  const value = valueProp !== undefined ? valueProp : inner;
  const bridge = useFormBridge(value === undefined ? "" : String(value));
  const [wrap, setWrap] = React.useState(false);

  React.useLayoutEffect(() => {
    const root = rootRef.current;
    const measure = measureRef.current;
    if (!root || !measure || typeof ResizeObserver === "undefined") return;
    const check = () => setWrap(segmentedNeedsWrap(measure.offsetWidth, root.clientWidth));
    check();
    const ro = new ResizeObserver(check);
    ro.observe(root);
    return () => ro.disconnect();
  }, [options]);

  const choose = (v: T) => {
    if (v === value) return;
    bridge.markUserChange();
    if (valueProp === undefined) setInner(v);
    onChange?.(v);
  };
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const move = (delta: number) => {
    const next = (index + delta + options.length) % options.length;
    const opt = options[next];
    if (!opt) return;
    choose(opt.value);
    refs.current[next]?.focus();
  };
  return (
    <div
      ref={rootRef}
      role="radiogroup"
      aria-label={label}
      data-wrap={wrap || undefined}
      className={cn(
        "relative w-full rounded-control bg-surface-2 p-0.5 sm:w-auto",
        wrap ? "grid grid-cols-2 gap-0.5" : "flex",
        className,
      )}
    >
      {/* Rangée invisible : largeur naturelle des libellés sur une ligne (le cadre coupe ce qui déborde). */}
      <div aria-hidden className="pointer-events-none invisible absolute inset-0 overflow-hidden">
        <div ref={measureRef} className="flex w-max p-0.5">
          {options.map((o) => (
            <span key={String(o.value)} className={cn(SEGMENT_TEXT, "whitespace-nowrap")}>
              {o.label}
            </span>
          ))}
        </div>
      </div>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => choose(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(-1);
              }
            }}
            className={cn(
              SEGMENT_TEXT,
              "min-w-0 cursor-pointer rounded-control transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
              wrap
                ? // Grille : libellé sur plusieurs lignes si besoin ; un dernier bouton seul prend la rangée.
                  cn(
                    "min-h-control-sm py-1 text-center break-words whitespace-normal",
                    options.length % 2 === 1 && i === options.length - 1 && "col-span-2",
                  )
                : "h-control-sm flex-auto truncate whitespace-nowrap sm:flex-none",
              // v4 : segment choisi en relief (fond `--control-on`, contour fort, ombre de repos), sans accent plein.
              active
                ? "bg-(--control-on) font-semibold text-fg shadow-rest ring-1 ring-border-strong"
                : "text-fg-muted hover:bg-surface-3 hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
      {name ? (
        <input
          ref={bridge.ref}
          type="hidden"
          name={name}
          value={value === undefined ? "" : String(value)}
          readOnly
        />
      ) : null}
    </div>
  );
}

/**
 * Section de formulaire. Desktop : toujours ouverte. Mobile : accordéon avec résumé d'une ligne quand
 * elle est fermée. `state` colore le numéro (complet / en erreur).
 */
function FormSection({
  index,
  title,
  summary,
  state,
  defaultOpen = true,
  children,
  id,
}: {
  index: number;
  title: string;
  summary?: string;
  state?: "complete" | "error";
  defaultOpen?: boolean;
  children: React.ReactNode;
  id?: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const contentId = React.useId();
  return (
    <section
      id={id}
      aria-labelledby={`${contentId}-titre`}
      className="min-w-0 scroll-mt-24 rounded-box border border-(--card-frame) bg-surface shadow-rest"
    >
      <h2 id={`${contentId}-titre`} className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-12 w-full cursor-pointer items-center gap-3 px-4 py-2 text-left md:cursor-default"
        >
          <span
            className={cn(
              "label-mono grid size-6 shrink-0 place-items-center rounded-pill border",
              state === "error"
                ? "border-danger text-danger"
                : state === "complete"
                  ? "border-ok text-ok"
                  : "border-border-strong text-fg-muted",
            )}
            aria-hidden
          >
            {state === "complete" ? <Check className="size-3.5" /> : index}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body font-semibold text-fg">{title}</span>
            {summary && !open ? (
              <span className="truncate text-small text-fg-muted md:hidden">{summary}</span>
            ) : null}
          </span>
          {state === "error" ? <span className="sr-only">(à compléter)</span> : null}
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 text-fg-muted transition-transform md:hidden",
              open && "rotate-180",
            )}
          />
        </button>
      </h2>
      <div
        id={contentId}
        className={cn("flex-col gap-4 px-4 pt-1 pb-4", open ? "flex" : "hidden md:flex")}
      >
        {children}
      </div>
    </section>
  );
}

/** Barre d'actions collante en bas du formulaire, collée à la barre d'onglets mobile (56 px + bordure). */
function ActionBar({ children, className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "sticky bottom-[calc(env(safe-area-inset-bottom)+3.5625rem)] z-20 -mx-4 flex flex-wrap items-center gap-2 border-t border-border bg-[color-mix(in_oklab,var(--surface)_94%,transparent)] px-4 py-2 backdrop-blur md:bottom-0 md:mx-0 md:border md:py-3",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "offline";

/** Indicateur d'enregistrement automatique (aria-live). */
function AutosaveIndicator({
  state,
  savedAt,
  onRetry,
}: {
  state: SaveState;
  savedAt?: Date | null;
  onRetry?: () => void;
}) {
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);
  const ago = savedAt ? Math.max(0, Math.round((Date.now() - savedAt.getTime()) / 1000)) : 0;
  const agoLabel =
    ago < 10 ? "à l'instant" : ago < 60 ? `il y a ${ago} s` : `il y a ${Math.round(ago / 60)} min`;
  return (
    <span
      className="label-mono inline-flex min-h-6 items-center gap-1.5 text-fg-muted"
      aria-live="polite"
      data-testid="autosave"
      data-state={state}
    >
      {state === "saving" ? (
        <>
          <Loader2 aria-hidden className="size-3.5 animate-spin" /> Enregistrement…
        </>
      ) : state === "saved" ? (
        <>
          <Check aria-hidden className="size-3.5 text-ok" /> Enregistré {agoLabel}
        </>
      ) : state === "dirty" ? (
        <>Modifié</>
      ) : state === "offline" ? (
        <>
          <CloudOff aria-hidden className="size-3.5 text-warn" /> Hors ligne
        </>
      ) : state === "error" ? (
        <>
          <TriangleAlert aria-hidden className="size-3.5 text-danger" /> Non enregistré
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 cursor-pointer items-center px-1 text-accent underline underline-offset-2 md:min-h-0"
            >
              Réessayer
            </button>
          ) : null}
        </>
      ) : (
        <>Brouillon non enregistré</>
      )}
    </span>
  );
}

/** Historique vertical : un point par événement, libellé, auteur, date. */
function Timeline({
  items,
}: {
  items: { id: string; title: React.ReactNode; meta: string; note?: string; color?: string }[];
}) {
  return (
    <ol className="flex flex-col">
      {items.map((it, i) => (
        <li key={it.id} className="relative flex gap-3 pb-4 last:pb-0">
          {i < items.length - 1 ? (
            <span aria-hidden className="absolute top-4 bottom-0 left-[5px] w-px bg-border" />
          ) : null}
          <span
            aria-hidden
            className="mt-1.5 size-[11px] shrink-0 border-2 border-surface"
            style={{ background: it.color ?? "var(--fg-muted)" }}
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-body text-fg">{it.title}</span>
            <span className="text-small text-fg-muted">{it.meta}</span>
            {it.note ? <span className="text-small text-fg">« {it.note} »</span> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Puce bascule (lignes, arrêts) : bouton aria-pressed, cible 44 px sur mobile. */
function ToggleChip({
  pressed,
  onPressedChange,
  children,
  disabled,
}: {
  pressed: boolean;
  onPressedChange: (v: boolean) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => onPressedChange(!pressed)}
      className={cn(CHIP_BASE, "h-control-sm font-normal", pressed ? CHIP_ON : CHIP_OFF)}
    >
      {pressed ? <Check aria-hidden className="size-3.5" /> : null}
      {children}
    </button>
  );
}

export { ActionBar, AutosaveIndicator, FormSection, Segmented, Timeline, ToggleChip };
