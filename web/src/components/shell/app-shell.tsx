"use client";

import { type ReactNode, Suspense } from "react";

import { UpdateDialog } from "@/components/changelog/update-dialog";
import type { UiPreferences } from "@/design/preferences";
import type { ReleaseSummary } from "@/lib/changelog";

import { CommandPalette } from "./command-palette";
import { MobileTabBar } from "./mobile-tabbar";
import { NavProgress } from "./nav-progress";
import { PageShortcuts } from "./page-shortcuts";
import { TelephonyInit } from "./telephony-init";
import { PageTransition } from "./page-transition";
import { RolesProvider } from "./roles-context";
import { ShellProvider } from "./shell-context";
import { ShellStatusProvider } from "./shell-status";
import { StudioCredit } from "./studio-credit";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import type { ShellUser } from "./types";
import { DEFAULT_ROLES, type RoleMeta } from "@/lib/roles";

/** Shell de l'application : barre latérale (≥ 768 px), barre du haut, onglets mobiles, palette ⌘K. */
export function AppShell({
  user,
  ui,
  version = null,
  update = null,
  roles = DEFAULT_ROLES,
  children,
}: {
  user: ShellUser;
  /** Rôles (collection `roles`, lot L3) : libellés et couleurs des avatars. */
  roles?: RoleMeta[];
  ui: UiPreferences;
  /** Version livrée (CHANGELOG.md), en pied de la barre latérale et dans « Plus ». */
  version?: string | null;
  /** Dernière version pas encore vue par l'agent : fenêtre « CSM a été mis à jour » (une fois). */
  update?: ReleaseSummary | null;
  children: ReactNode;
}) {
  return (
    <RolesProvider roles={roles}>
      <ShellProvider user={user} initialUi={ui} version={version}>
        <ShellStatusProvider enabled>
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
              <main id="contenu" className="flex-1">
                {children}
              </main>
              <footer
                data-print="hide"
                className="px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+5rem)] text-center md:px-6 md:pb-4 md:text-left"
              >
                <StudioCredit />
              </footer>
            </div>
          </div>
          <Suspense fallback={null}>
            <NavProgress />
          </Suspense>
          <PageShortcuts />
          <TelephonyInit />
          <PageTransition />
          <MobileTabBar />
          <CommandPalette />
          {update ? <UpdateDialog release={update} /> : null}
        </ShellStatusProvider>
      </ShellProvider>
    </RolesProvider>
  );
}
