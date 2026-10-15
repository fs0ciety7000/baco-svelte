"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/misc";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { activeModule, activeTab, CHANGELOG_LINK } from "@/navigation";

import { DutyChip } from "@/components/ops/duty-districts";

import { ModuleTabs } from "./module-tabs";
import { useShell } from "./shell-context";
import { NotificationBell } from "./notification-bell";
import { OnlinePresence } from "./online-presence";
import { SHELL_ICON, SHELL_MENU } from "./shell-ui";
import { UserMenu } from "./user-menu";

/**
 * Barre du haut (lot 3 du design v4, 15 oct. 2026 ; une ligne depuis le 11 oct.). Desktop : module courant en gras +
 * ses onglets (trait accent arrondi, compteur par onglet), puce des districts du jour, recherche élargie « Train, gare,
 * bon, agent… Ctrl K » qui ouvre ⌘K (icône seule sous 1280 px), « + Nouveau » (≥ 1536 px), icônes nues de 34 px
 * (présence, cloche), avatar carré arrondi sans nom ni rôle (ils sont dans le menu du compte).
 * Mobile : 48 px collante, marque + module courant, puce des districts, recherche, cloche, avatar (44 px ; onglets sous
 * la barre).
 */
export function Topbar() {
  const { modules, admin, account, actions, setPaletteOpen, user } = useShell();
  const pathname = usePathname();
  const mod = activeModule(pathname, [...modules, ...(admin ? [admin] : [])]);
  // Administration : ses pages sont dans la barre latérale (14 oct. 2026) ; la barre du haut affiche « Administration › page ».
  const adminPage = mod && mod.id === "admin" ? activeTab(pathname, mod) : undefined;

  return (
    <header
      data-print="hide"
      className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-[color-mix(in_oklab,var(--bg)_90%,transparent)] px-2 backdrop-blur-md backdrop-saturate-150 md:gap-4 md:px-5"
    >
      <Link
        href="/"
        className="flex h-11 shrink-0 items-center gap-2 rounded-control px-1 md:hidden"
        aria-label="Accueil CSM"
      >
        <span
          aria-hidden
          className="display grid size-6 place-items-center rounded-[min(var(--r-control),6px)] bg-fg text-label leading-none text-bg"
        >
          C
        </span>
      </Link>
      <p className="min-w-0 truncate text-body-lg font-semibold tracking-[-0.01em] text-fg md:shrink-0">
        {mod?.label ??
          account.find((l) => pathname === l.href || pathname.startsWith(`${l.href}/`))?.label ??
          (pathname === CHANGELOG_LINK.href ? CHANGELOG_LINK.label : "Accueil")}
        {adminPage ? (
          <span
            className="hidden font-normal text-fg-muted md:inline"
            data-testid="topbar-admin-page"
          >
            {" "}
            › {adminPage.label}
          </span>
        ) : null}
      </p>
      {mod && mod.tabs.length > 1 && !adminPage ? (
        <div className="hidden h-full min-w-0 flex-1 md:flex">
          <ModuleTabs moduleId={mod.id} variant="bar" />
        </div>
      ) : (
        <div className="hidden flex-1 md:block" />
      )}
      <div className="ml-auto flex shrink-0 items-center gap-0.5 md:ml-0 md:gap-1.5">
        {user.duty ? (
          <DutyChip
            districts={user.duty.districts}
            today={user.duty.today}
            suggested={user.duty.suggested ?? null}
          />
        ) : null}
        {/* Recherche élargie (≥ 1280 px) : un champ d'apparence, qui ouvre la palette ⌘K. */}
        <button
          type="button"
          aria-label="Rechercher, aller à"
          aria-keyshortcuts="Control+K"
          onClick={() => setPaletteOpen(true)}
          className={cn(
            "hidden h-[2.125rem] shrink-0 cursor-pointer items-center gap-2 rounded-control border border-border bg-(--control-bg) text-small text-fg-subtle transition-colors outline-none hover:border-border-strong hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-accent md:inline-flex",
            "md:w-[2.125rem] md:justify-center xl:w-60 xl:justify-start xl:px-2.5 2xl:w-68",
            "pointer-coarse:h-11 md:pointer-coarse:w-11 xl:pointer-coarse:w-60",
          )}
        >
          <Search aria-hidden className="size-4 shrink-0 text-fg-muted" />
          <span className="hidden truncate xl:inline">Train, gare, bon, agent…</span>
          <Kbd className="ml-auto hidden shrink-0 whitespace-nowrap xl:inline-flex">Ctrl K</Kbd>
        </button>
        <Button
          size="icon"
          variant="ghost"
          className={cn(SHELL_ICON, "md:hidden")}
          aria-label="Rechercher"
          onClick={() => setPaletteOpen(true)}
        >
          <Search className="size-5" aria-hidden />
        </Button>
        {actions.length > 0 ? (
          <Menu.Root>
            <Menu.Trigger asChild>
              <Button
                variant="secondary"
                size="sm"
                className="hidden h-[2.125rem] 2xl:inline-flex"
                aria-label="Nouveau"
              >
                <Plus /> Nouveau
              </Button>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content align="end" sideOffset={6} className={cn(SHELL_MENU, "w-60 py-1")}>
                {actions.map((a) => (
                  <Menu.Item
                    key={a.href}
                    asChild
                    className="flex h-control cursor-pointer items-center gap-3 px-3 text-body outline-none data-[highlighted]:bg-surface-3"
                  >
                    <Link href={a.href}>
                      <a.icon className="size-4 text-fg-muted" aria-hidden /> {a.label}
                    </Link>
                  </Menu.Item>
                ))}
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        ) : null}
        {/* « En ligne maintenant » : `presence:read` (l'invité ne l'a pas : audit sécurité du 11 oct. 2026). */}
        {can(user, "presence:read") ? (
          <span className="hidden md:inline-flex">
            <OnlinePresence />
          </span>
        ) : null}
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
