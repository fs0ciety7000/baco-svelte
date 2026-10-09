"use client";

import { type ReactNode, Suspense } from "react";

import type { UiPreferences } from "@/design/preferences";

import { CommandPalette } from "./command-palette";
import { MobileTabBar } from "./mobile-tabbar";
import { NavProgress } from "./nav-progress";
import { PageShortcuts } from "./page-shortcuts";
import { ShellProvider } from "./shell-context";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import type { ShellUser } from "./types";

/** Shell de l'application : barre latérale (≥ 768 px), barre du haut, onglets mobiles, palette ⌘K. */
export function AppShell({
  user,
  ui,
  children,
}: {
  user: ShellUser;
  ui: UiPreferences;
  children: ReactNode;
}) {
  return (
    <ShellProvider user={user} initialUi={ui}>
      <a
        href="#contenu"
        className="sr-only z-50 bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Aller au contenu
      </a>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main
            id="contenu"
            className="flex-1 pb-[calc(env(safe-area-inset-bottom)+4.5rem)] md:pb-0"
          >
            {children}
          </main>
        </div>
      </div>
      <Suspense fallback={null}>
        <NavProgress />
      </Suspense>
      <PageShortcuts />
      <MobileTabBar />
      <CommandPalette />
    </ShellProvider>
  );
}
