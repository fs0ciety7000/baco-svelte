"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as React from "react";
import { Drawer } from "vaul";

import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;
const PopoverClose = PopoverPrimitive.Close;

/** Surface flottante ancrée (Radix : positionnement, collisions, Échap, clic dehors, portail), ouverture `pop-in`. */
function PopoverContent({
  className,
  align = "start",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          "z-50 rounded-box border border-border-strong bg-surface text-fg shadow-lg outline-none data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

/** Mode « feuille du bas » des listes et calendriers : écran étroit (< 768 px) ou pointeur tactile. */
export function usePickerSheet(): boolean {
  return useMediaQuery("(max-width: 767px), (pointer: coarse)");
}

/**
 * Surface des contrôles personnalisés (Select, calendriers) : Popover ancré sur `anchor` en desktop, feuille du bas Vaul
 * (titre = libellé du champ) en mobile ou au doigt. L'ouverture est pilotée par le contrôle (`open` / `onOpenChange`) ;
 * à la fermeture, le focus revient au déclencheur sauf si l'agent a cliqué ailleurs.
 */
function PickerSurface({
  open,
  onOpenChange,
  sheet,
  title,
  anchor,
  triggerRef,
  children,
  className,
  role,
  id,
  onOpenAutoFocus,
  onKeyDown,
  "aria-label": ariaLabel,
  modal = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheet: boolean;
  title: string;
  anchor: React.ReactNode;
  triggerRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  className?: string;
  role?: string;
  id?: string;
  onOpenAutoFocus?: (e: Event) => void;
  onKeyDown?: React.KeyboardEventHandler;
  "aria-label"?: string;
  /** Piège le focus dans la surface (dialogue du calendrier, motif APG « Date picker dialog »). */
  modal?: boolean;
}) {
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const restoreFocus = (e: Event) => {
    e.preventDefault();
    const active = document.activeElement;
    if (!active || active === document.body || active.closest("[data-picker-surface]"))
      triggerRef.current?.focus({ preventScroll: true });
  };
  if (sheet) {
    return (
      <>
        <div className="min-w-0">{anchor}</div>
        <Drawer.Root open={open} onOpenChange={onOpenChange} direction="bottom">
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-50 bg-[color-mix(in_oklab,var(--bg)_65%,transparent)]" />
            <Drawer.Content
              data-picker-surface=""
              aria-describedby={undefined}
              onOpenAutoFocus={onOpenAutoFocus}
              onCloseAutoFocus={restoreFocus}
              onKeyDown={onKeyDown}
              className="fixed right-0 bottom-0 left-0 z-50 flex max-h-[85dvh] flex-col rounded-t-box border-t border-border bg-surface outline-none safe-bottom"
            >
              <Drawer.Handle className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-border-strong" />
              <Drawer.Title className="px-5 pt-3 pb-2 text-h3 font-semibold">{title}</Drawer.Title>
              <div
                id={id}
                role={role}
                aria-label={ariaLabel}
                className={cn("overflow-y-auto px-3 pb-4", className)}
              >
                {children}
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange} modal={modal}>
      <PopoverAnchor asChild>
        <div ref={anchorRef} className="min-w-0">
          {anchor}
        </div>
      </PopoverAnchor>
      <PopoverContent
        data-picker-surface=""
        id={id}
        role={role}
        aria-label={ariaLabel}
        aria-modal={modal || undefined}
        onOpenAutoFocus={onOpenAutoFocus ?? ((e) => e.preventDefault())}
        onCloseAutoFocus={restoreFocus}
        onKeyDown={onKeyDown}
        onInteractOutside={(e) => {
          // Un clic sur le déclencheur est géré par le déclencheur (bascule) : ne pas fermer puis rouvrir.
          if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
        className={className}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

export { PickerSurface, Popover, PopoverAnchor, PopoverClose, PopoverContent, PopoverTrigger };
