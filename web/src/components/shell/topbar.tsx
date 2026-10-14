"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/misc";
import { activeModule, CHANGELOG_LINK } from "@/navigation";

import { DutyChip } from "@/components/ops/duty-districts";

import { ModuleTabs } from "./module-tabs";
import { useShell } from "./shell-context";
import { NotificationBell } from "./notification-bell";
import { OnlinePresence } from "./online-presence";
import { UserMenu } from "./user-menu";

/**
 * Barre du haut (évolution du 11 oct. 2026 : haut de page sur une ligne). Desktop : module courant + ses onglets,
 * puce des districts du jour, recherche ⌘K, « + Nouveau », présence, cloche, menu utilisateur.
 * Mobile : 48 px collante, marque + module courant, puce des districts, recherche, menu utilisateur (onglets sous la barre).
 */
export function Topbar() {
  const { modules, admin, actions, setPaletteOpen, user } = useShell();
  const pathname = usePathname();
  const mod = activeModule(pathname, [...modules, ...(admin ? [admin] : [])]);

  return (
    <header
      data-print="hide"
      className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] px-3 backdrop-blur md:gap-3 md:px-4"
    >
      <Link href="/" className="flex items-center gap-2 md:hidden" aria-label="Accueil CSM">
        <span aria-hidden className="size-2 bg-accent" />
        <span className="display text-body-lg tracking-wider">CSM</span>
      </Link>
      <p className="min-w-0 truncate text-body font-semibold text-fg md:shrink-0 md:text-body-lg">
        <span className="font-normal text-fg-muted md:hidden">· </span>
        {mod?.label ?? (pathname === CHANGELOG_LINK.href ? CHANGELOG_LINK.label : "Accueil")}
      </p>
      {mod && mod.tabs.length > 1 ? (
        <div className="hidden h-full min-w-0 flex-1 md:flex">
          <ModuleTabs moduleId={mod.id} variant="bar" />
        </div>
      ) : (
        <div className="hidden flex-1 md:block" />
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0 md:gap-2">
        {user.duty ? (
          <DutyChip
            districts={user.duty.districts}
            today={user.duty.today}
            suggested={user.duty.suggested ?? null}
          />
        ) : null}
        <Button
          variant="ghost"
          className="hidden justify-start border border-border text-fg-muted md:inline-flex md:w-11 md:px-0 xl:w-56 xl:px-3"
          aria-label="Rechercher, aller à"
          onClick={() => setPaletteOpen(true)}
        >
          <Search className="mx-auto xl:mx-0" />
          <span className="hidden xl:inline">Rechercher…</span>
          <span className="ml-auto hidden gap-1 xl:flex">
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </span>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="md:hidden"
          aria-label="Rechercher"
          onClick={() => setPaletteOpen(true)}
        >
          <Search className="size-5" />
        </Button>
        {actions.length > 0 ? (
          <Menu.Root>
            <Menu.Trigger asChild>
              <Button variant="secondary" className="hidden md:inline-flex" aria-label="Nouveau">
                <Plus /> <span className="hidden xl:inline">Nouveau</span>
              </Button>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content
                align="end"
                sideOffset={6}
                className="z-50 w-60 border border-border-strong bg-surface py-1 data-[state=open]:animate-fade-in"
              >
                {actions.map((a) => (
                  <Menu.Item
                    key={a.href}
                    asChild
                    className="flex h-control cursor-pointer items-center gap-3 px-3 text-body outline-none data-[highlighted]:bg-surface-2"
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
        {/* Invité : pas de liste des agents en ligne (audit sécurité du 11 oct. 2026). */}
        {user.role !== "guest" ? (
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
