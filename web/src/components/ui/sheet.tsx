"use client";

import * as React from "react";
import { Drawer } from "vaul";

import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

/**
 * Panneau de détail : bottom sheet avec poignée sur mobile, panneau latéral droit sur desktop (≥ 768 px).
 * Utilisé pour le détail d'une commande sans quitter la liste.
 */
function Sheet({
  open,
  onOpenChange,
  trigger,
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const desktop = useMediaQuery("(min-width: 768px)");
  return (
    // handleOnly : seule la poignée (mobile) fait glisser le panneau. Sans cela, sélectionner du texte (clic +
    // glisser) déplaçait le panneau → copier-coller impossible (retour utilisateur du 8 oct. 2026). Sur desktop il n'y
    // a pas de poignée : fermeture par Échap, clic sur le fond ou le bouton de la page.
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      direction={desktop ? "right" : "bottom"}
      handleOnly
    >
      {trigger ? <Drawer.Trigger asChild>{trigger}</Drawer.Trigger> : null}
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-[color-mix(in_oklab,var(--bg)_65%,transparent)]" />
        <Drawer.Content
          className={cn(
            "fixed z-50 flex flex-col border-border bg-surface outline-none",
            desktop
              ? "top-0 right-0 bottom-0 w-[min(32rem,100vw)] border-l"
              : "right-0 bottom-0 left-0 max-h-[92dvh] border-t safe-bottom",
          )}
        >
          {!desktop ? (
            <Drawer.Handle className="mx-auto mt-2 h-1.5 w-12 shrink-0 bg-border-strong" />
          ) : null}
          <div className="flex flex-col gap-1 border-b border-border px-5 py-4">
            {eyebrow ? <p className="label-mono text-fg-muted">{eyebrow}</p> : null}
            <Drawer.Title className="text-h3 font-semibold">{title}</Drawer.Title>
            {description ? (
              <Drawer.Description className="text-body text-fg-muted">
                {description}
              </Drawer.Description>
            ) : null}
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <div className="flex gap-2 border-t border-border px-5 py-3">{footer}</div>
          ) : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export { Sheet };
