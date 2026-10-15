"use client";

import { Check } from "lucide-react";
import * as React from "react";

import type { Step } from "@/lib/orders/steps";
import { cn } from "@/lib/utils";

/**
 * Rail d'étapes collant à gauche des bons (≥ 1280 px, v4 lot 4) : la suite des sections est réelle, d'où la
 * numérotation ; vert = complète, rouge = à compléter, accent = section à l'écran. Un clic fait défiler jusqu'à la
 * section (sans animation en mouvement réduit) et y place le focus.
 */
export function OrderSteps({ steps, className }: { steps: Step[]; className?: string }) {
  const [current, setCurrent] = React.useState(steps[0]?.id ?? "");
  const ids = steps.map((s) => s.id).join("|");

  React.useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = ids
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        }
        // Section courante : la plus haute encore visible sous la barre du haut.
        const first = [...visible.entries()].sort((a, b) => a[1] - b[1])[0];
        if (first) setCurrent(first[0]);
      },
      { rootMargin: "-72px 0px -45% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids]);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    el.querySelector<HTMLElement>("h2 button")?.focus({ preventScroll: true });
    setCurrent(id);
  };

  return (
    <nav
      aria-label="Étapes du bon"
      data-testid="order-steps"
      className={cn("flex-col gap-0.5", className)}
    >
      {steps.map((s) => {
        const cur = s.id === current;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => go(s.id)}
            aria-current={cur ? "step" : undefined}
            data-state={s.state}
            className={cn(
              "flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-control px-2.5 text-left text-body font-medium transition-colors",
              cur
                ? "bg-surface text-fg shadow-rest"
                : "text-fg-muted hover:bg-surface-3 hover:text-fg",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-pill text-label font-semibold tabular",
                s.state === "complete"
                  ? "bg-[color-mix(in_oklab,var(--ok)_var(--tint,12%),var(--surface))] text-ok"
                  : s.state === "todo"
                    ? "bg-[color-mix(in_oklab,var(--danger)_var(--tint,12%),var(--surface))] text-danger"
                    : cur
                      ? "bg-accent text-accent-fg"
                      : "bg-surface-3 text-fg-muted",
              )}
            >
              {s.state === "complete" ? <Check className="size-3" strokeWidth={3} /> : s.index}
            </span>
            <span className="min-w-0 truncate">{s.title}</span>
            <span className="sr-only">
              {s.state === "complete"
                ? " (complète)"
                : s.state === "todo"
                  ? " (à compléter)"
                  : " (facultative)"}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
