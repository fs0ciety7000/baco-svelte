"use client";

import * as React from "react";
import { Drawer } from "vaul";

import { ghostFlip } from "@/lib/motion";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

// Dernière ligne / carte cliquée (moins de 800 ms) : origine du cadre fantôme à l'ouverture d'un panneau.
let origin: { rect: DOMRect; at: number } | null = null;
if (typeof document !== "undefined")
  document.addEventListener(
    "pointerdown",
    (e) => {
      // La ligne entière plutôt que le bouton cliqué dedans.
      const t = e.target as Element | null;
      const el =
        t?.closest?.("[data-hl]") ??
        t?.closest?.("tr") ??
        t?.closest?.("[data-entry] article") ??
        t?.closest?.("li") ??
        t?.closest?.("button");
      origin = el ? { rect: el.getBoundingClientRect(), at: Date.now() } : null;
    },
    { capture: true, passive: true },
  );
function lastOrigin(): DOMRect | null {
  return origin && Date.now() - origin.at < 800 ? origin.rect : null;
}

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
  // Continuité ligne → panneau : à l'ouverture, cadre fantôme depuis la ligne (ou la carte) qui vient d'être cliquée.
  const wasOpen = React.useRef(open);
  React.useEffect(() => {
    if (open && !wasOpen.current) {
      const origin = lastOrigin();
      if (origin) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const width = Math.min(512, w);
        ghostFlip(
          origin,
          desktop
            ? { left: w - width, top: 0, width, height: h }
            : { left: 0, top: h * 0.3, width: w, height: h * 0.7 },
        );
      }
    }
    wasOpen.current = open;
  }, [open, desktop]);
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
              ? "top-0 right-0 bottom-0 w-[min(32rem,100vw)] rounded-l-box border-l"
              : "right-0 bottom-0 left-0 max-h-[92dvh] rounded-t-box border-t safe-bottom",
          )}
        >
          {!desktop ? (
            <Drawer.Handle className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-border-strong" />
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
