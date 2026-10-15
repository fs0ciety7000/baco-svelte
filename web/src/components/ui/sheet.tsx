"use client";

import { X } from "lucide-react";
import * as React from "react";
import { Drawer } from "vaul";

import { ghostFlip } from "@/lib/motion-core";
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
 * Dès 1280 px (11 oct. 2026), panneau **ancré** : sans voile ni piège du focus, sous la barre du haut, la page se
 * resserre à sa gauche (`html[data-sheet-docked]`) : la liste reste visible et cliquable pour enchaîner les fiches.
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
  const docked = useMediaQuery("(min-width: 1280px)");
  // Page resserrée à gauche du panneau ancré (compteur : plusieurs panneaux peuvent exister dans la page).
  React.useEffect(() => {
    if (!(open && docked)) return;
    const root = document.documentElement;
    const n = Number(root.dataset.sheetDocked ?? 0) + 1;
    root.dataset.sheetDocked = String(n);
    return () => {
      const left = Number(root.dataset.sheetDocked ?? 1) - 1;
      if (left > 0) root.dataset.sheetDocked = String(left);
      else delete root.dataset.sheetDocked;
    };
  }, [open, docked]);
  // Continuité ligne → panneau : à l'ouverture, cadre fantôme depuis la ligne (ou la carte) qui vient d'être cliquée.
  const wasOpen = React.useRef(open);
  React.useEffect(() => {
    if (open && !wasOpen.current) {
      const origin = lastOrigin();
      if (origin) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const width = Math.min(docked ? 448 : 512, w);
        ghostFlip(
          origin,
          desktop
            ? { left: w - width, top: docked ? 48 : 0, width, height: docked ? h - 48 : h }
            : { left: 0, top: h * 0.3, width: w, height: h * 0.7 },
        );
      }
    }
    wasOpen.current = open;
  }, [open, desktop, docked]);
  return (
    // handleOnly : seule la poignée (mobile) fait glisser le panneau. Sans cela, sélectionner du texte (clic +
    // glisser) déplaçait le panneau → copier-coller impossible (retour utilisateur du 8 oct. 2026). Sur desktop il n'y
    // a pas de poignée : fermeture par Échap, clic sur le fond ou le bouton de la page.
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      direction={desktop ? "right" : "bottom"}
      handleOnly
      modal={!docked}
    >
      {trigger ? <Drawer.Trigger asChild>{trigger}</Drawer.Trigger> : null}
      <Drawer.Portal>
        {!docked ? (
          <Drawer.Overlay className="fixed inset-0 z-50 bg-[color-mix(in_oklab,var(--bg)_65%,transparent)]" />
        ) : null}
        <Drawer.Content
          // Ancré : la liste reste utilisable ; fermeture par la croix ou Échap seulement (sinon un clic sur un bouton de
          // la liste fermait le panneau et la page se réagençait sous le curseur).
          onInteractOutside={docked ? (e) => e.preventDefault() : undefined}
          className={cn(
            "fixed z-50 flex flex-col border-border bg-surface shadow-float outline-none",
            docked
              ? "top-12 right-0 bottom-0 w-[28rem] border-l"
              : desktop
                ? "top-0 right-0 bottom-0 w-[min(32rem,100vw)] rounded-l-box border-l"
                : "right-0 bottom-0 left-0 max-h-[92dvh] rounded-t-box border-t safe-bottom",
          )}
        >
          {!desktop ? (
            <Drawer.Handle className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-border-strong" />
          ) : null}
          <div className="relative flex flex-col gap-1 border-b border-border px-5 py-4 pr-14">
            {desktop ? (
              <Drawer.Close
                aria-label="Fermer le panneau"
                className="absolute top-3 right-3 grid size-9 cursor-pointer place-items-center rounded-control text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                <X className="size-4" aria-hidden />
              </Drawer.Close>
            ) : null}
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
