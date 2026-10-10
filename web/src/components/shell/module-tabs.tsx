"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type CSSProperties, useEffect, useRef } from "react";

import { modColor } from "@/design/module-color";

import { useSlideIndicator } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { activeTab } from "@/navigation";

import { useShell } from "./shell-context";

/** Onglets d'un module, sous forme de liens (chaque onglet est une route). Trait accent glissant (GSAP). */
export function ModuleTabs({ moduleId }: { moduleId: string }) {
  const { modules, admin } = useShell();
  const pathname = usePathname();
  const mod = [...modules, ...(admin ? [admin] : [])].find((m) => m.id === moduleId);
  const ref = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const current = mod ? activeTab(pathname, mod) : undefined;

  useSlideIndicator(ref, bar, '[aria-current="page"]');
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  if (!mod || mod.tabs.length < 2) return null;
  return (
    <div
      data-print="hide"
      ref={ref}
      role="navigation"
      style={{ "--mod": modColor(moduleId) } as CSSProperties}
      aria-label={`Onglets ${mod.label}`}
      className="relative -mx-4 flex overflow-x-auto border-b border-border px-4 [scrollbar-width:none] md:mx-0 md:px-0"
    >
      {mod.tabs.map((t) => {
        const isActive = current?.href === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-control shrink-0 items-center px-4 text-body font-medium whitespace-nowrap text-fg-muted transition-colors hover:text-fg",
              isActive && "bg-surface-2 text-fg",
            )}
          >
            {t.label}
          </Link>
        );
      })}
      <span
        aria-hidden
        ref={bar}
        className="pointer-events-none invisible absolute bottom-0 left-0 h-0.5 w-px origin-left bg-(--mod)"
      />
    </div>
  );
}
