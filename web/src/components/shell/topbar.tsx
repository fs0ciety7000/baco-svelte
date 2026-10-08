"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/misc";
import { activeModule, activeTab } from "@/navigation";

import { useShell } from "./shell-context";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

/**
 * Barre du haut. Desktop : fil (module › onglet), recherche ⌘K, « + Nouveau », menu utilisateur.
 * Mobile : 48 px collante, marque + module courant, recherche, menu utilisateur.
 */
export function Topbar() {
  const { modules, actions, setPaletteOpen } = useShell();
  const pathname = usePathname();
  const mod = activeModule(pathname, modules);
  const tab = mod ? activeTab(pathname, mod) : undefined;

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] px-3 backdrop-blur md:h-14 md:px-6">
      <Link href="/" className="flex items-center gap-2 md:hidden" aria-label="Accueil CSM">
        <span aria-hidden className="size-2 bg-accent" />
        <span className="display text-body-lg tracking-wider">CSM</span>
      </Link>
      <p className="label-mono min-w-0 truncate text-fg-muted">
        <span className="md:hidden"> · {mod?.label}</span>
        <span className="hidden md:inline">
          {mod?.label}
          {tab && mod?.tabs.length ? ` › ${tab.label}` : ""}
        </span>
      </p>
      <div className="ml-auto flex items-center gap-1 md:gap-2">
        <Button
          variant="ghost"
          className="hidden w-64 justify-start border border-border text-fg-muted md:inline-flex"
          onClick={() => setPaletteOpen(true)}
        >
          <Search /> Rechercher, aller à…
          <span className="ml-auto flex gap-1">
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
              <Button variant="primary" className="hidden md:inline-flex">
                <Plus /> Nouveau
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
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
