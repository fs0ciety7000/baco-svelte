"use client";

import type * as React from "react";

import { modColor } from "@/design/module-color";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { activeModule } from "@/navigation";

import { useShell } from "./shell-context";

/**
 * Barre latérale desktop : 6 entrées au plus, icône + libellé. Rail de 96 px (libellé sous l'icône) entre 768 et
 * 1280 px, 232 px au-delà. L'entrée active porte un trait accent à gauche.
 */
export function Sidebar() {
  const { modules } = useShell();
  const pathname = usePathname();
  const active = activeModule(pathname, modules);

  return (
    <nav
      aria-label="Navigation principale"
      className="sticky top-0 hidden h-dvh w-24 shrink-0 flex-col border-r border-border bg-surface md:flex xl:w-58"
    >
      <Link
        href="/"
        className="flex h-14 items-center justify-center gap-2 border-b border-border px-4 xl:justify-start"
      >
        <span aria-hidden className="size-2.5 bg-accent" />
        <span className="display text-h3 tracking-wider">CSM</span>
      </Link>
      <ul className="flex flex-1 flex-col gap-1 p-2">
        {modules.map((m) => {
          const isActive = active?.id === m.id;
          const Icon = m.icon;
          return (
            <li key={m.id}>
              <Link
                href={m.href}
                aria-current={isActive ? "page" : undefined}
                // Couleur du module (thèmes « taxonomie » comme Craie ; ailleurs, l'accent).
                style={{ "--mod": modColor(m.id) } as React.CSSProperties}
                className={cn(
                  "relative flex flex-col items-center gap-1 px-1 py-2 text-small text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg xl:h-10 xl:flex-row xl:gap-3 xl:px-3 xl:py-0 xl:text-body",
                  isActive && "bg-surface-2 text-fg",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-1 bottom-1 left-0 w-0.5",
                    isActive ? "bg-(--mod)" : "bg-transparent",
                  )}
                />
                <Icon className={cn("size-5 xl:size-4", isActive && "text-(--mod)")} aria-hidden />
                <span className="text-center leading-tight">{m.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="hidden px-4 py-3 font-mono text-small text-fg-muted xl:block">
        Client Solutions
      </p>
    </nav>
  );
}
