"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type CSSProperties, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { modColor } from "@/design/module-color";

import { useSlideIndicator } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { activeTab, type NavTab } from "@/navigation";

import { CountNote, CountPill } from "./counts";
import { useShell } from "./shell-context";
import { fitTabs } from "./module-tabs-fit";
import { useShellStatus } from "./shell-status";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
/**
 * Onglets d'un module, sous forme de liens (chaque onglet est une route). Trait accent arrondi qui glisse (GSAP), compteur
 * neutre par onglet quand le shell en porte un (`NavTab.count` : Suivi, Journal, Missions), annoncé par une description.
 * `bar` : dans la barre du haut (desktop, hauteur pleine, sans bordure) ; les onglets qui ne tiennent pas passent dans
 * un menu « Plus » (l'onglet ouvert reste visible). `page` : sous la barre (mobile), défilement horizontal, onglet
 * ouvert sur fond `surface` (lot 3 du design v4).
 */
export function ModuleTabs({
  moduleId,
  variant = "page",
}: {
  moduleId: string;
  variant?: "page" | "bar";
}) {
  const { modules, admin } = useShell();
  const { status } = useShellStatus();
  const pathname = usePathname();
  const noteId = useId();
  const mod = [...modules, ...(admin ? [admin] : [])].find((m) => m.id === moduleId);
  const ref = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const current = mod ? activeTab(pathname, mod) : undefined;
  const tabs = mod?.tabs ?? [];
  const activeIndex = tabs.findIndex((t) => t.href === current?.href);
  // La répartition est liée à la liste d'onglets qui l'a produite : en changeant de module, l'ancienne (indices d'un autre
  // module) est ignorée jusqu'à la nouvelle mesure. Sinon `tabs[i]` valait undefined → « reading 'href' », page en erreur
  // (15 oct. 2026, « momentanément indisponible » aléatoire).
  const sig = tabs.map((t) => t.href).join("|");
  const [measured, setFit] = useState<{ shown: number[]; more: number[]; sig: string } | null>(
    null,
  );
  const fit = measured && measured.sig === sig ? measured : null;
  // Les compteurs changent la largeur des onglets : nouvelle mesure quand ils changent.
  const countSig = tabs.map((t) => (t.count ? (status?.counts?.[t.count] ?? 0) : 0)).join(",");

  // Recalcul du trait quand les onglets visibles changent (répartition « Plus » selon la largeur).
  useSlideIndicator(ref, bar, '[aria-current="page"]', [fit?.shown.join(",")], {
    inset: variant === "bar" ? 10 : 0,
    rounded: true,
  });
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
      setFit({ ...fitTabs(widths, box.clientWidth, activeIndex), sig });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(box);
    return () => ro.disconnect();
  }, [variant, activeIndex, sig, countSig]);

  if (!mod || tabs.length < 2) return null;
  const counts = (status?.counts ?? {}) as Record<string, number | undefined>;
  const countOf = (t: NavTab) => (t.count ? (counts[t.count] ?? 0) : 0);
  const tabClass = (isActive: boolean) =>
    cn(
      "inline-flex shrink-0 items-center gap-1.5 text-body font-medium whitespace-nowrap text-fg-muted transition-colors outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
      variant === "bar" ? "h-full px-2.5" : "h-control rounded-t-control px-4",
      isActive && (variant === "bar" ? "text-fg" : "bg-surface text-fg"),
    );
  const pick = (list: number[]) => list.map((i) => tabs[i]).filter((t): t is NavTab => !!t);
  const shown = variant === "bar" && fit ? pick(fit.shown) : tabs;
  const more: NavTab[] = variant === "bar" && fit ? pick(fit.more) : [];

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
      {shown.map((t, i) => {
        const isActive = current?.href === t.href;
        const n = countOf(t);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            aria-describedby={n && t.count ? `${noteId}-${i}` : undefined}
            className={tabClass(isActive)}
          >
            {t.label}
            {n && t.count ? <CountPill countKey={t.count} value={n} tinted={false} /> : null}
          </Link>
        );
      })}
      {shown.map((t, i) => {
        const n = countOf(t);
        return n && t.count ? (
          <CountNote key={t.href} id={`${noteId}-${i}`} countKey={t.count} value={n} />
        ) : null;
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
              className="z-50 min-w-48 rounded-box border border-border bg-surface py-1 shadow-float data-[state=open]:animate-fade-in"
            >
              {more.map((t) => (
                <Menu.Item
                  key={t.href}
                  asChild
                  className="flex h-control cursor-pointer items-center gap-2 px-3 text-body text-fg outline-none data-[highlighted]:bg-surface-3"
                >
                  <Link href={t.href}>
                    {t.label}
                    {countOf(t) && t.count ? (
                      <CountPill countKey={t.count} value={countOf(t)} tinted={false} />
                    ) : null}
                  </Link>
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
          {tabs.map((t) => {
            const n = countOf(t);
            return (
              <span key={t.href} className={tabClass(false)}>
                {t.label}
                {n && t.count ? <CountPill countKey={t.count} value={n} tinted={false} /> : null}
              </span>
            );
          })}
        </div>
      ) : null}
      <span
        aria-hidden
        ref={bar}
        className="pointer-events-none invisible absolute bottom-0 left-0 h-0.5 w-px origin-left rounded-pill bg-(--mod)"
      />
    </div>
  );
}
