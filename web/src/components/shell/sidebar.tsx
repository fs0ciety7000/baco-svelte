"use client";

import type * as React from "react";

import { modColor } from "@/design/module-color";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { activeModule, CHANGELOG_LINK } from "@/navigation";

import { useShell } from "./shell-context";
import { useShellStatus } from "./shell-status";

// Compteur par module : ce qui attend l'agent (bons terminés à envoyer, missions impactées, non lus du Journal).
const COUNT_TONE: Record<string, { tone: string; title: string }> = {
  commandes: { tone: "text-warn bg-warn/12", title: "bons terminés à envoyer" },
  pmr: { tone: "text-danger bg-danger/12", title: "missions impactées par un retard" },
  operations: { tone: "text-info bg-info/12", title: "messages non lus au Journal (24 h)" },
};

function ago(iso: string, now: number): { text: string; stale: boolean } {
  const min = Math.max(0, Math.round((now - new Date(iso.replace(" ", "T")).getTime()) / 60_000));
  const text =
    min < 1 ? "à l'instant" : min < 60 ? `il y a ${min} min` : `il y a ${Math.floor(min / 60)} h`;
  return { text, stale: min > 60 };
}

/**
 * Barre latérale desktop : 6 entrées au plus, icône + libellé. Rail de 96 px (libellé sous l'icône) entre 768 et
 * 1280 px, 232 px au-delà. L'entrée active porte un trait accent à gauche.
 */
export function Sidebar() {
  const { modules, version } = useShell();
  const { status, live } = useShellStatus();
  const pathname = usePathname();
  const active = activeModule(pathname, modules);
  const counts = status?.counts as Record<string, number | undefined> | undefined;
  const dicos = status?.dicosAt ? ago(status.dicosAt, Date.now()) : null;
  const onChangelog = pathname === CHANGELOG_LINK.href;

  return (
    <nav
      data-print="hide"
      aria-label="Navigation principale"
      className="sticky top-0 hidden h-dvh w-24 shrink-0 flex-col border-r border-border bg-surface md:flex xl:w-58"
    >
      <Link
        href="/"
        className="flex h-12 items-center justify-center gap-2 border-b border-border px-4 xl:justify-start"
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
                {counts?.[m.id] ? (
                  <span
                    title={`${counts[m.id]} ${COUNT_TONE[m.id]?.title ?? ""}`}
                    data-testid={`nav-count-${m.id}`}
                    className={cn(
                      "absolute top-1 right-1 min-w-5 rounded-control px-1 text-center font-mono text-[0.75rem] leading-5 font-semibold tabular xl:static xl:ml-auto",
                      COUNT_TONE[m.id]?.tone,
                    )}
                  >
                    {counts[m.id]! > 99 ? "99+" : counts[m.id]}
                    <span className="sr-only"> {COUNT_TONE[m.id]?.title}</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      {/* État des flux : une seule ligne par source, au lieu de « En direct » répété sur chaque carte. */}
      <div
        aria-label="État des flux"
        className="hidden flex-col gap-1.5 border-t border-border px-4 py-3 text-small text-fg-muted xl:flex"
      >
        <span className="text-fg-subtle">État des flux</span>
        <span className="flex items-center gap-2" data-testid="feed-live">
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full",
              live === "direct" ? "bg-ok" : live === "coupé" ? "bg-danger" : "bg-warn",
            )}
          />
          Temps réel
          <span className="ml-auto text-fg-subtle">
            {live === "direct" ? "connecté" : live === "coupé" ? "coupé" : "connexion…"}
          </span>
        </span>
        {counts?.pmr !== undefined ? (
          <span className="flex items-center gap-2" data-testid="feed-dicos">
            <span
              aria-hidden
              className={cn(
                "size-2 shrink-0 rounded-full",
                !dicos || dicos.stale ? "bg-warn" : "bg-ok",
              )}
            />
            DICOS
            <span className="ml-auto text-fg-subtle">{dicos ? dicos.text : "pas aujourd'hui"}</span>
          </span>
        ) : null}
      </div>
      {/* Nouveautés et version livrée : discret, sous l'état des flux (icône seule sur le rail). */}
      <Link
        href={CHANGELOG_LINK.href}
        aria-current={onChangelog ? "page" : undefined}
        data-testid="sidebar-changelog"
        title={version ? `${CHANGELOG_LINK.label} · version ${version}` : CHANGELOG_LINK.label}
        className={cn(
          "flex min-h-11 flex-col items-center justify-center gap-0.5 border-t border-border px-2 py-2 text-small text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg xl:flex-row xl:justify-start xl:gap-2 xl:px-4",
          onChangelog && "bg-surface-2 text-fg",
        )}
      >
        <Sparkles aria-hidden className="size-4 shrink-0" />
        <span>{CHANGELOG_LINK.label}</span>
        {version ? (
          <span className="hidden font-mono text-fg-subtle tabular xl:ml-auto xl:inline">
            v{version}
          </span>
        ) : null}
      </Link>
    </nav>
  );
}
