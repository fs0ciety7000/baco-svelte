"use client";

import type * as React from "react";

import { modColor } from "@/design/module-color";
import { LayoutGrid } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { activeModule } from "@/navigation";

import { useShell } from "./shell-context";

/**
 * Barre d'onglets mobile (< 768 px) : 5 modules (Annuaire compris, 9 oct. 2026) + « Plus ». Libellé mono, trait accent en haut de l'actif,
 * respect de safe-area-inset-bottom. « Plus » ouvre les autres modules, l'administration et les actions.
 */
export function MobileTabBar() {
  const { modules, admin } = useShell();
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const active = activeModule(pathname, modules);
  const primary = modules.filter((m) => m.mobile).slice(0, 5);
  const others = [...modules.filter((m) => !primary.includes(m)), ...(admin ? [admin] : [])];
  const moreActive = !!active && !primary.some((m) => m.id === active.id);

  const item = "relative flex h-14 flex-1 flex-col items-center justify-center gap-1 text-fg-muted";

  return (
    <>
      <nav
        aria-label="Navigation principale"
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface md:hidden"
      >
        <ul className="flex">
          {primary.map((m) => {
            const isActive = active?.id === m.id;
            const Icon = m.icon;
            return (
              <li key={m.id} className="flex flex-1">
                <Link
                  href={m.href}
                  aria-current={isActive ? "page" : undefined}
                  style={{ "--mod": modColor(m.id) } as React.CSSProperties}
                  className={cn(item, isActive && "text-(--mod)")}
                >
                  <span
                    aria-hidden
                    className={cn("absolute inset-x-3 top-0 h-0.5", isActive && "bg-(--mod)")}
                  />
                  <Icon className="size-5" aria-hidden />
                  <span className="max-w-full truncate text-[0.75rem] leading-4 font-medium">
                    {m.shortLabel ?? m.label}
                  </span>
                </Link>
              </li>
            );
          })}
          <li className="flex flex-1">
            <button
              type="button"
              onClick={() => setMore(true)}
              aria-haspopup="dialog"
              className={cn(item, "cursor-pointer", moreActive && "text-accent")}
            >
              <span
                aria-hidden
                className={cn("absolute inset-x-3 top-0 h-0.5", moreActive && "bg-accent")}
              />
              <LayoutGrid className="size-5" aria-hidden />
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
                <ul className="ml-8 flex flex-col border-l border-border">
                  {m.tabs.map((t) => (
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
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}
