"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";

import { useSlideIndicator } from "@/lib/motion";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

/**
 * Onglets (v4) : texte plein sur l'actif, trait accent de 2 px arrondi qui glisse (GSAP), compteur en pastille neutre.
 * Défilement horizontal sur mobile, sans barre visible.
 */
function TabsList({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const ref = React.useRef<HTMLDivElement>(null);
  const bar = React.useRef<HTMLSpanElement>(null);

  useSlideIndicator(ref, bar, '[data-state="active"]');

  return (
    <TabsPrimitive.List
      ref={ref}
      data-slot="tabs-list"
      className={cn(
        "relative flex max-w-full overflow-x-auto border-b border-border [scrollbar-width:none]",
        className,
      )}
      {...props}
    >
      {children}
      <span
        aria-hidden
        ref={bar}
        className="pointer-events-none invisible absolute bottom-0 left-0 h-0.5 w-px origin-left rounded-pill bg-accent"
      />
    </TabsPrimitive.List>
  );
}

function TabsTrigger({
  className,
  count,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> & { count?: number }) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-control shrink-0 cursor-pointer items-center gap-2 px-3 text-body font-medium text-fg-muted transition-colors hover:text-fg data-[state=active]:text-fg",
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined ? (
        <span className="inline-grid h-5 min-w-5 place-items-center rounded-pill bg-surface-2 px-1.5 text-label font-semibold tracking-normal text-fg-muted tabular">
          {count}
        </span>
      ) : null}
    </TabsPrimitive.Trigger>
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content data-slot="tabs-content" className={cn("pt-4", className)} {...props} />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
