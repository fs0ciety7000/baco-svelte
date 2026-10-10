"use client";

import { Slot } from "@radix-ui/react-slot";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import * as React from "react";

import { cn, pl } from "@/lib/utils";

/**
 * Puce de filtre (raccourcis de dates, vues, catégories) : un seul style dans toute l'application (audit UI du
 * 9 oct. 2026 : 5 styles de puces). Sélection = contour accent + fond `accent-soft`. `asChild` pour un lien.
 */
export function FilterChip({
  pressed,
  asChild,
  className,
  ...props
}: React.ComponentProps<"button"> & { pressed?: boolean; asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="filter-chip"
      data-pressed={pressed || undefined}
      {...(!asChild ? { type: "button", "aria-pressed": !!pressed } : {})}
      className={cn(
        "inline-flex h-control-sm shrink-0 cursor-pointer items-center gap-1.5 rounded-control border px-3 text-small font-medium whitespace-nowrap transition-colors duration-150",
        pressed
          ? "border-accent bg-accent-soft text-fg"
          : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
        className,
      )}
      {...props}
    />
  );
}

/** Rangée de puces : défile horizontalement en mobile, passe à la ligne en desktop. */
export function ChipRow({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-print="hide"
      className={cn(
        "-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0",
        className,
      )}
      {...props}
    />
  );
}

const openByPage = new Map<string, boolean>();

/**
 * Filtres secondaires repliables en mobile (audit du 9 oct. 2026 : les filtres occupaient le premier écran). En
 * desktop, les champs restent en ligne (`md:contents`). Les champs ne sont jamais démontés : ils partent avec le
 * formulaire même repliés.
 */
export function CollapsibleFilters({
  active,
  children,
  className,
}: {
  /** Nombre de filtres actifs (affiché sur le bouton). */
  active: number;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpenState] = React.useState(false);
  const id = React.useId();
  // Le formulaire est remonté à chaque changement d'URL (FilterForm) : l'état ouvert est gardé par page.
  React.useEffect(() => {
    if (openByPage.get(window.location.pathname)) setOpenState(true);
  }, []);
  const setOpen = (fn: (o: boolean) => boolean) =>
    setOpenState((o) => {
      const next = fn(o);
      openByPage.set(window.location.pathname, next);
      return next;
    });
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="col-span-2 inline-flex h-control items-center gap-2 rounded-control border border-border-strong px-3 text-body text-fg md:hidden"
      >
        <SlidersHorizontal aria-hidden className="size-4" />
        Filtres
        {active ? (
          <span className="text-small text-fg-muted">
            ({active} {pl(active, "actif")})
          </span>
        ) : null}
        <ChevronDown
          aria-hidden
          className={cn("ml-auto size-4 transition-transform", open && "rotate-180")}
        />
      </button>
      <div
        id={id}
        className={cn(
          open ? "col-span-2 grid grid-cols-2 gap-2" : "hidden",
          "md:contents",
          className,
        )}
      >
        {children}
      </div>
    </>
  );
}
