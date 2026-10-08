"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";

import { gsap, MOTION_OK, useGSAP } from "@/lib/motion";
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

  useGSAP(
    () => {
      const el = ref.current?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!el || !bar.current) return;
      const target = { x: el.offsetLeft, width: el.offsetWidth };
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.to(bar.current, { ...target, duration: 0.3, ease: "hud" });
      });
      mm.add("(prefers-reduced-motion: reduce)", () => gsap.set(bar.current, target));
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    },
    { scope: ref, dependencies: [pathname] },
  );

  if (!mod || mod.tabs.length < 2) return null;
  return (
    <div
      ref={ref}
      role="navigation"
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
        className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-0 bg-accent"
      />
    </div>
  );
}
