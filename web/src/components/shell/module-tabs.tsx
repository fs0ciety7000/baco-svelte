"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";

import { modColor } from "@/design/module-color";

import { useSlideIndicator } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { activeTab, type NavTab } from "@/navigation";

import { useShell } from "./shell-context";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
/** Largeur réservée au bouton « Plus » (libellé + chevron + marges). */
const MORE_WIDTH = 84;

/**
 * Tabs that fit in `width`: the active one is always kept; the rest go into « Plus » (14 Oct. 2026: the Administration
 * tabs were cut off in the top bar with no visible way to reach them).
 */
export function fitTabs(
  widths: number[],
  width: number,
  active: number,
): { shown: number[]; more: number[] } {
  const all = widths.map((_, i) => i);
  const total = widths.reduce((a, b) => a + b, 0);
  if (!widths.length || total <= width) return { shown: all, more: [] };
  const budget = width - MORE_WIDTH;
  const shown: number[] = [];
  let used = active >= 0 ? (widths[active] ?? 0) : 0;
  for (const i of all) {
    if (i === active) continue;
    const w = widths[i] ?? 0;
    if (used + w > budget) break;
    shown.push(i);
    used += w;
  }
  if (active >= 0) shown.push(active);
  shown.sort((a, b) => a - b);
  return { shown, more: all.filter((i) => !shown.includes(i)) };
}

/**
 * Onglets d'un module, sous forme de liens (chaque onglet est une route). Trait accent glissant (GSAP).
 * `bar` : dans la barre du haut (desktop, hauteur pleine, sans bordure) ; les onglets qui ne tiennent pas passent dans
 * un menu « Plus » (l'onglet ouvert reste visible). `page` : sous la barre (mobile), défilement horizontal.
 */
export function ModuleTabs({
  moduleId,
  variant = "page",
}: {
  moduleId: string;
  variant?: "page" | "bar";
}) {
  const { modules, admin } = useShell();
  const pathname = usePathname();
  const mod = [...modules, ...(admin ? [admin] : [])].find((m) => m.id === moduleId);
  const ref = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const current = mod ? activeTab(pathname, mod) : undefined;
  const tabs = mod?.tabs ?? [];
  const activeIndex = tabs.findIndex((t) => t.href === current?.href);
  const [fit, setFit] = useState<{ shown: number[]; more: number[] } | null>(null);

  // Recalcul du trait quand les onglets visibles changent (répartition « Plus » selon la largeur).
  useSlideIndicator(ref, bar, '[aria-current="page"]', [fit?.shown.join(",")]);
  useEffect(() => {
    // Barre du haut : pas de défilement (overflow caché, le reste est dans « Plus ») ; le faire décalait l'onglet ouvert
    // hors de vue. Sous la barre (mobile) : l'onglet ouvert est ramené à l'écran.
    if (variant === "bar") {
      if (ref.current) ref.current.scrollLeft = 0;
      return;
    }
    ref.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname, variant, fit]);

  // Barre du haut : mesure des onglets (copie invisible) et de la place disponible.
  useIsoLayoutEffect(() => {
    if (variant !== "bar") return;
    const box = ref.current;
    const ruler = measure.current;
    if (!box || !ruler) return;
    const compute = () => {
      const widths = Array.from(ruler.children).map((c) => (c as HTMLElement).offsetWidth);
      setFit(fitTabs(widths, box.clientWidth, activeIndex));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(box);
    return () => ro.disconnect();
  }, [variant, activeIndex, tabs.length]);

  if (!mod || tabs.length < 2) return null;
  const tabClass = (isActive: boolean) =>
    cn(
      "inline-flex shrink-0 items-center text-body font-medium whitespace-nowrap text-fg-muted transition-colors hover:text-fg",
      variant === "bar" ? "h-full px-3" : "h-control px-4",
      isActive && (variant === "bar" ? "text-fg" : "bg-surface-2 text-fg"),
    );
  const shown = variant === "bar" && fit ? fit.shown.map((i) => tabs[i]!) : tabs;
  const more: NavTab[] = variant === "bar" && fit ? fit.more.map((i) => tabs[i]!) : [];

  return (
    <div
      data-print="hide"
      ref={ref}
      role="navigation"
      style={{ "--mod": modColor(moduleId) } as CSSProperties}
      aria-label={`Onglets ${mod.label}`}
      className={cn(
        "relative flex",
        variant === "bar"
          ? "h-full min-w-0 flex-1 overflow-hidden"
          : "-mx-4 overflow-x-auto border-b border-border px-4 [scrollbar-width:none] md:mx-0 md:px-0",
      )}
    >
      {shown.map((t) => {
        const isActive = current?.href === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            className={tabClass(isActive)}
          >
            {t.label}
          </Link>
        );
      })}
      {more.length ? (
        <Menu.Root>
          <Menu.Trigger
            className="inline-flex h-full shrink-0 cursor-pointer items-center gap-1 px-3 text-body font-medium text-fg-muted outline-none hover:text-fg data-[state=open]:text-fg"
            data-testid="module-tabs-more"
          >
            Plus <ChevronDown className="size-4" aria-hidden />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content
              align="start"
              sideOffset={4}
              className="z-50 min-w-48 border border-border-strong bg-surface py-1 data-[state=open]:animate-fade-in"
            >
              {more.map((t) => (
                <Menu.Item
                  key={t.href}
                  asChild
                  className="flex h-control cursor-pointer items-center px-3 text-body text-fg outline-none data-[highlighted]:bg-surface-2"
                >
                  <Link href={t.href}>{t.label}</Link>
                </Menu.Item>
              ))}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      ) : null}
      {variant === "bar" ? (
        // Copie invisible pour mesurer la largeur de chaque onglet (même police, mêmes marges).
        <div
          ref={measure}
          aria-hidden
          className="pointer-events-none invisible absolute top-0 left-0 flex h-full"
        >
          {tabs.map((t) => (
            <span key={t.href} className={tabClass(false)}>
              {t.label}
            </span>
          ))}
        </div>
      ) : null}
      <span
        aria-hidden
        ref={bar}
        className="pointer-events-none invisible absolute bottom-0 left-0 h-0.5 w-px origin-left bg-(--mod)"
      />
    </div>
  );
}
