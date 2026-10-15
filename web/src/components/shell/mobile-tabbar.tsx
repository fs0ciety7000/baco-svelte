"use client";

import type * as React from "react";

import { modColor } from "@/design/module-color";
import { LayoutGrid, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";

import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  activeModule,
  CHANGELOG_LINK,
  tabGroups,
  type NavModule,
  type ShellCountKey,
} from "@/navigation";

import { CountNote, CountPill, useShellCount } from "./counts";
import { useShell } from "./shell-context";

const ITEM =
  "relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-fg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset";

/** Onglet d'un module : trait accent en haut de l'actif, badge rond teinté (annoncé par une description). */
function TabLink({ module: m, active }: { module: NavModule; active: boolean }) {
  const countKey = m.id as ShellCountKey;
  const value = useShellCount(m.id);
  const noteId = useId();
  const Icon = m.icon;
  return (
    <li className="flex min-w-0 flex-1">
      <Link
        href={m.href}
        aria-current={active ? "page" : undefined}
        // Libellé court affiché (« Bons »), nom complet annoncé (« Commandes »).
        aria-label={m.shortLabel ? m.label : undefined}
        aria-describedby={value ? noteId : undefined}
        style={{ "--mod": modColor(m.id) } as React.CSSProperties}
        className={cn(ITEM, active && "text-fg")}
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-x-[28%] top-0 h-0.5 rounded-b-pill",
            active && "bg-(--mod)",
          )}
        />
        <span className="relative">
          <Icon
            className={cn("size-[1.375rem]", active && "text-(--mod)")}
            strokeWidth={1.75}
            aria-hidden
          />
          {value ? (
            <CountPill
              countKey={countKey}
              value={value}
              className="absolute -top-1.5 left-3.5 h-[1.125rem] min-w-[1.125rem] px-1 ring-2 ring-surface"
            />
          ) : null}
        </span>
        <span className="max-w-full truncate px-0.5 text-[0.75rem] leading-4 font-medium">
          {m.shortLabel ?? m.label}
        </span>
      </Link>
      {value ? <CountNote id={noteId} countKey={countKey} value={value} /> : null}
    </li>
  );
}

/**
 * Barre d'onglets mobile (< 768 px) : 4 modules (Accueil, Opérations, Bons, PMR ; 14 oct. 2026) + « Plus ». Fond
 * `surface`, trait accent arrondi en haut de l'onglet actif, badges ronds teintés (lot 3 du design v4),
 * safe-area-inset-bottom respectée. « Plus » ouvre les autres modules, l'administration et les Nouveautés.
 */
export function MobileTabBar() {
  const { modules, admin, version } = useShell();
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const active = activeModule(pathname, modules);
  const primary = modules.filter((m) => m.mobile).slice(0, 4);
  const others = [...modules.filter((m) => !primary.includes(m)), ...(admin ? [admin] : [])];
  const moreActive = !!active && !primary.some((m) => m.id === active.id);

  return (
    <>
      <nav
        data-print="hide"
        aria-label="Navigation principale"
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface md:hidden"
      >
        <ul className="flex">
          {primary.map((m) => (
            <TabLink key={m.id} module={m} active={active?.id === m.id} />
          ))}
          <li className="flex min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setMore(true)}
              aria-haspopup="dialog"
              className={cn(ITEM, "cursor-pointer", moreActive && "text-fg")}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-[28%] top-0 h-0.5 rounded-b-pill",
                  moreActive && "bg-accent",
                )}
              />
              <LayoutGrid
                className={cn("size-[1.375rem]", moreActive && "text-accent")}
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="text-[0.75rem] leading-4 font-medium">Plus</span>
            </button>
          </li>
        </ul>
      </nav>
      <Sheet open={more} onOpenChange={setMore} eyebrow="Navigation" title="Plus">
        <ul className="flex flex-col gap-4">
          {others.map((m) => {
            const Icon = m.icon;
            return (
              <li key={m.id} className="flex flex-col gap-1">
                <Link
                  href={m.href}
                  onClick={() => setMore(false)}
                  className="flex h-12 items-center gap-3 text-body-lg font-medium"
                >
                  <Icon className="size-5 text-fg-muted" aria-hidden /> {m.label}
                </Link>
                {tabGroups(m).map((g) => (
                  <div key={g.label} className="ml-8 flex flex-col">
                    {g.label ? (
                      <p className="px-3 pt-1 text-small text-fg-subtle">{g.label}</p>
                    ) : null}
                    <ul className="flex flex-col border-l border-border">
                      {g.tabs.map((t) => (
                        <li key={t.href}>
                          <Link
                            href={t.href}
                            onClick={() => setMore(false)}
                            className="flex h-11 items-center px-3 text-body text-fg-muted hover:text-fg"
                          >
                            {t.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </li>
            );
          })}
          <li className="border-t border-border pt-2">
            <Link
              href={CHANGELOG_LINK.href}
              onClick={() => setMore(false)}
              data-testid="more-changelog"
              className="flex h-12 items-center gap-3 text-body-lg font-medium"
            >
              <Sparkles className="size-5 text-fg-muted" aria-hidden /> {CHANGELOG_LINK.label}
              {version ? (
                <span className="ml-auto font-mono text-small font-normal text-fg-subtle tabular">
                  Version {version}
                </span>
              ) : null}
            </Link>
          </li>
        </ul>
      </Sheet>
    </>
  );
}
