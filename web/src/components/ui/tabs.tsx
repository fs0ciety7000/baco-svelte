"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";

import { gsap, MOTION_OK, useGSAP } from "@/lib/motion";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

/**
 * Onglets « segmented » : fond surface-2 sur l'actif, trait accent de 2 px qui glisse (GSAP), compteur en chip.
 * Défilement horizontal sur mobile, sans barre visible.
 */
function TabsList({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const ref = React.useRef<HTMLDivElement>(null);
  const bar = React.useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const list = ref.current;
      if (!list) return;
      const place = (animate: boolean) => {
        const active = list.querySelector<HTMLElement>('[data-state="active"]');
        if (!active || !bar.current) return;
        const props = { x: active.offsetLeft, width: active.offsetWidth };
        const mm = gsap.matchMedia();
        mm.add(MOTION_OK, () => {
          if (animate) gsap.to(bar.current, { ...props, duration: 0.3, ease: "hud" });
          else gsap.set(bar.current, props);
        });
        mm.add("(prefers-reduced-motion: reduce)", () => gsap.set(bar.current, props));
      };
      place(false);
      const observer = new MutationObserver(() => place(true));
      observer.observe(list, { subtree: true, attributes: true, attributeFilter: ["data-state"] });
      const onResize = () => place(false);
      window.addEventListener("resize", onResize);
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", onResize);
      };
    },
    { scope: ref },
  );

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
        className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-0 bg-accent"
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
        "inline-flex h-control shrink-0 cursor-pointer items-center gap-2 px-4 text-body font-medium text-fg-muted transition-colors hover:text-fg data-[state=active]:bg-surface-2 data-[state=active]:text-fg",
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined ? (
        <span className="border border-border bg-surface px-1.5 font-mono text-small tabular">
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
