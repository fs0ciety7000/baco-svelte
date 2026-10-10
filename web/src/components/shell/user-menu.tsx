"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { LogOut, Palette, Shield, SwatchBook } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { logout } from "@/app/connexion/actions";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Dialog, DialogContent } from "@/components/ui/dialog";

import { Avatar } from "./avatar";
import { useShell } from "./shell-context";
import { ROLE_LABEL } from "./types";

const itemClass =
  "flex h-control cursor-pointer items-center gap-3 px-3 text-body text-fg outline-none select-none data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-fg-muted";

/** Menu utilisateur : identité, préférences d'affichage, design system, administration (admin), déconnexion. */
export function UserMenu({ compact }: { compact?: boolean }) {
  const { user, admin, ui, setUi } = useShell();
  const [prefsOpen, setPrefsOpen] = useState(false);

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          className="flex h-control cursor-pointer items-center gap-2 px-1 text-left hover:bg-surface-2 md:px-2"
          aria-label={`Menu de ${user.name || user.email}`}
        >
          <Avatar name={user.name} email={user.email} id={user.id} avatar={user.avatar} />
          {!compact ? (
            <span className="hidden min-w-0 flex-col lg:flex">
              <span className="truncate text-small font-medium text-fg">
                {user.name || user.email}
              </span>
              <span className="truncate text-small text-fg-muted">{ROLE_LABEL[user.role]}</span>
            </span>
          ) : null}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            align="end"
            sideOffset={6}
            className="z-50 w-64 border border-border-strong bg-surface py-1 data-[state=open]:animate-fade-in"
          >
            <div className="flex flex-col gap-0.5 border-b border-border px-3 py-2">
              <span className="truncate text-body font-medium">{user.name || user.email}</span>
              <span className="truncate text-small text-fg-muted">{user.email}</span>
              <span className="label-mono mt-1 text-fg-muted">{ROLE_LABEL[user.role]}</span>
            </div>
            <Menu.Item className={itemClass} onSelect={() => setPrefsOpen(true)}>
              <Palette /> Affichage (thème, densité)
            </Menu.Item>
            <Menu.Item asChild className={itemClass}>
              <Link href="/design">
                <SwatchBook /> Design system
              </Link>
            </Menu.Item>
            {admin ? (
              <>
                <Menu.Separator className="my-1 h-px bg-border" />
                <Menu.Label className="label-mono px-3 py-1 text-fg-muted">
                  Administration
                </Menu.Label>
                {admin.tabs.map((t) => (
                  <Menu.Item key={t.href} asChild className={itemClass}>
                    <Link href={t.href}>
                      <Shield /> {t.label}
                    </Link>
                  </Menu.Item>
                ))}
              </>
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
