"use client";

import { Toaster as Sonner, toast } from "sonner";

/** Toasts : carrés, bordure gauche de statut, titre mono, 4 s, annoncés aux lecteurs d'écran (Sonner). */
function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      duration={4000}
      offset={16}
      mobileOffset={{ bottom: "calc(env(safe-area-inset-bottom) + 72px)" }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-[min(24rem,calc(100vw-2rem))] items-start gap-3 border border-border border-l-[3px] border-l-fg-muted bg-surface-2 px-4 py-3 text-body text-fg",
          title: "label-mono text-fg",
          description: "mt-1 text-hint text-fg-muted",
          actionButton:
            "ml-auto h-8 cursor-pointer border border-border-strong px-3 text-small text-fg hover:bg-surface",
          success: "border-l-ok",
          error: "border-l-danger",
          warning: "border-l-warn",
          info: "border-l-info",
        },
      }}
    />
  );
}

export { toast, Toaster };
