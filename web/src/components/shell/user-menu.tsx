"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { LogOut, Palette, Shield, SwatchBook } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { logout } from "@/app/connexion/actions";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { Avatar } from "./avatar";
import { useShell } from "./shell-context";
import { useRoleLabel } from "./roles-context";
import { SHELL_MENU } from "./shell-ui";

const itemClass =
  "flex h-control cursor-pointer items-center gap-3 px-3 text-body text-fg outline-none select-none data-[highlighted]:bg-surface-3 [&_svg]:size-4 [&_svg]:text-fg-muted";

/**
 * Menu utilisateur : identité, mon profil (avatar, mot de passe, passkeys, sessions…), mon planning, extension CSM,
 * préférences d'affichage, design system, lien vers l'administration (admin), déconnexion. Les liens n'apparaissent que si l'onglet
 * est visible pour l'agent (même règle que la navigation).
 * Déclencheur (lot 3 du design v4, décision de l'utilisateur du 15 oct. 2026) : avatar carré arrondi seul, le nom et le
 * rôle sont en tête du menu (et dans le nom accessible du bouton).
 */
export function UserMenu() {
  const { user, admin, account: personal, ui, setUi } = useShell();
  const roleLabel = useRoleLabel();
  const [prefsOpen, setPrefsOpen] = useState(false);

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-control outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-accent md:pointer-fine:size-[2.125rem]"
          aria-label={`Menu de ${user.name || user.email}`}
          title={`${user.name || user.email} · ${roleLabel(user.role)}`}
        >
          <Avatar
            name={user.name}
            email={user.email}
            id={user.id}
            avatar={user.avatar}
            role={user.role}
            className="size-[1.875rem] rounded-[min(var(--r-box),8px)] text-label"
          />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content align="end" sideOffset={6} className={cn(SHELL_MENU, "w-64 py-1")}>
            <div className="flex flex-col gap-0.5 border-b border-border px-3 py-2">
              <span className="truncate text-body font-medium">{user.name || user.email}</span>
              <span className="truncate text-small text-fg-muted">{user.email}</span>
              <span className="label-mono mt-1 text-fg-muted" data-testid="user-menu-role">
                {roleLabel(user.role)}
              </span>
            </div>
            {personal.map((l) => (
              <Menu.Item key={l.href} asChild className={itemClass}>
                <Link href={l.href} data-testid={`user-menu-${l.href.split("/").pop()}`}>
                  <l.icon /> {l.label}
                </Link>
              </Menu.Item>
            ))}
            {personal.length ? <Menu.Separator className="my-1 h-px bg-border" /> : null}
            <Menu.Item className={itemClass} onSelect={() => setPrefsOpen(true)}>
              <Palette /> Affichage (thème, densité)
            </Menu.Item>
            <Menu.Item asChild className={itemClass}>
              <Link href="/design">
                <SwatchBook /> Design system
              </Link>
            </Menu.Item>
            {/* Les pages d'administration sont dans la barre latérale (14 oct. 2026) : un seul lien ici, par habitude. */}
            {admin ? (
              <Menu.Item asChild className={itemClass}>
                <Link href={admin.href} data-testid="user-menu-admin">
                  <Shield /> Administration
                </Link>
              </Menu.Item>
            ) : null}
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.Item className={itemClass} onSelect={() => void logout()}>
              <LogOut /> Déconnexion
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      <Dialog open={prefsOpen} onOpenChange={setPrefsOpen}>
        <DialogContent
          eyebrow="Préférences"
          title="Affichage"
          className="max-w-2xl"
          description="Appliqué tout de suite, mémorisé pour tes prochaines connexions."
        >
          <ThemeSwitcher value={ui} onChange={setUi} />
        </DialogContent>
      </Dialog>
    </>
  );
}
