"use client";

import * as React from "react";

import { scrollEdges } from "@/lib/scroll-edges";
import { cn } from "@/lib/utils";

/**
 * Tableau large qui défile proprement (15 oct. 2026, Missions PMR / Groupes coupés à droite) : défilement dans le cadre
 * (hauteur bornée à l'écran : l'en-tête reste collé en haut et la barre horizontale reste visible en bas), barre fine
 * aux couleurs du thème, ombres de bord tant qu'il reste du contenu caché, première colonne collante (`stickyFirst` :
 * le train reste lisible en défilant). Zone focalisable (flèches du clavier) avec un nom accessible. Les colonnes
 * secondaires se masquent par requête de conteneur (`@container`, classe `hidden @5xl:table-cell` sur la cellule).
 * Mêmes `THead` / `Th` / `Tr` / `Td` que `Table`.
 */
export function ScrollTable({
  label,
  stickyFirst = false,
  stickyLast = false,
  className,
  tableClassName,
  children,
  "data-testid": testId,
}: {
  /** Nom de la zone de défilement (lecteurs d'écran). */
  label: string;
  stickyFirst?: boolean;
  /** Dernière colonne collante à droite (action de ligne toujours visible, ex. « Copier »). */
  stickyLast?: boolean;
  className?: string;
  tableClassName?: string;
  children: React.ReactNode;
  "data-testid"?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ left: false, right: false });
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = scrollEdges(el.scrollLeft, el.scrollWidth, el.clientWidth);
        setEdges((p) => (p.left === next.left && p.right === next.right ? p : next));
      });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    const table = el.firstElementChild;
    if (table) ro?.observe(table);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, []);
  return (
    <div
      className={cn(
        "@container relative w-full min-w-0 rounded-box border border-(--card-frame) bg-surface shadow-rest",
        className,
      )}
      data-scroll-left={edges.left || undefined}
      data-scroll-right={edges.right || undefined}
      data-testid={testId}
    >
      <div
        ref={ref}
        role="region"
        aria-label={label}
        tabIndex={0}
        data-slot="scroll-table"
        className="relative max-h-[max(20rem,calc(100dvh-9rem))] overflow-auto overscroll-x-contain rounded-box [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin] focus-visible:outline-1 focus-visible:outline-offset-[-1px] focus-visible:outline-accent"
      >
        <table
          className={cn(
            "w-full border-collapse text-body",
            // Lignes « pleine largeur » (repère « maintenant », `data-band`) exclues des colonnes collantes.
            stickyFirst &&
              "[&_tr:not([data-band])>td:first-child]:sticky [&_tr:not([data-band])>td:first-child]:left-0 [&_tr:not([data-band])>td:first-child]:z-[1] [&_tr:not([data-band])>td:first-child]:bg-inherit [&_tr:not([data-band])>td:first-child]:shadow-[inset_3px_0_0_var(--status)] [&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-[2] [&_th:first-child]:bg-(--th-bg)",
            stickyFirst &&
              edges.left &&
              "[&_tr:not([data-band])>td:first-child]:shadow-[inset_3px_0_0_var(--status),8px_0_10px_-8px_color-mix(in_oklab,var(--fg)_35%,transparent)] [&_th:first-child]:shadow-[8px_0_10px_-8px_color-mix(in_oklab,var(--fg)_35%,transparent)]",
            stickyLast &&
              "[&_tr:not([data-band])>td:last-child]:sticky [&_tr:not([data-band])>td:last-child]:right-0 [&_tr:not([data-band])>td:last-child]:z-[1] [&_tr:not([data-band])>td:last-child]:bg-inherit [&_th:last-child]:sticky [&_th:last-child]:right-0 [&_th:last-child]:z-[2] [&_th:last-child]:bg-(--th-bg)",
            stickyLast &&
              edges.right &&
              "[&_tr:not([data-band])>td:last-child]:shadow-[-8px_0_10px_-8px_color-mix(in_oklab,var(--fg)_35%,transparent)] [&_th:last-child]:shadow-[-8px_0_10px_-8px_color-mix(in_oklab,var(--fg)_35%,transparent)]",
            tableClassName,
          )}
        >
          {children}
        </table>
      </div>
      {/* Ombres de bord : contenu caché à gauche (sans colonne collante) ou à droite. */}
      {!stickyFirst ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 z-[3] w-6 rounded-l-box bg-linear-to-r from-[color-mix(in_oklab,var(--fg)_14%,transparent)] to-transparent transition-opacity duration-150",
            edges.left ? "opacity-100" : "opacity-0",
          )}
        />
      ) : null}
      <div
        aria-hidden
        data-testid={testId ? `${testId}-edge-right` : undefined}
        hidden={stickyLast}
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 z-[3] w-8 rounded-r-box bg-linear-to-l from-[color-mix(in_oklab,var(--fg)_16%,transparent)] to-transparent transition-opacity duration-150",
          edges.right ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
