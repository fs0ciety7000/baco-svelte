import { ChevronDown } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Carte (v4, 15 oct. 2026) : séparée de la page par le ton (`surface` sur `bg`) et une ombre de repos quasi invisible ;
 * contour du thème (`--card-frame` : trait fin le jour, aucun la nuit dans Signal / Quai). Les thèmes « angle » gardent
 * leur cadre chanfreiné et n'ont pas d'ombre.
 */
function Card({
  className,
  tone,
  ...props
}: React.ComponentProps<"div"> & { tone?: "default" | "raised" | "live" }) {
  return (
    <div
      data-slot="card"
      className={cn(
        "chamfer flex flex-col shadow-rest [--frame:var(--card-frame)]",
        tone === "raised" && "[--fill:var(--surface-2)]",
        tone === "live" && "[--frame:color-mix(in_oklab,var(--accent)_55%,var(--border))]",
        className,
      )}
      {...props}
    />
  );
}

/**
 * En-tête compact : sourcil facultatif, titre 15 / 600 (souligné d'un trait accent dans la direction Quai), compteur
 * neutre, actions à droite.
 */
function CardHeader({
  className,
  eyebrow,
  title,
  count,
  actions,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  count?: number;
  actions?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-4 pt-4", className)} {...props}>
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow ? <p className="label-mono text-fg-muted">{eyebrow}</p> : null}
        {title ? (
          <h3 className="flex min-w-0 items-center gap-2 text-body font-semibold text-fg">
            <span className="title-rule truncate">{title}</span>
            {count !== undefined ? <Count>{count}</Count> : null}
          </h3>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Compteur neutre en pilule (onglets, en-têtes de carte). */
function Count({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="count"
      className={cn(
        "inline-grid h-5 min-w-5 place-items-center rounded-pill bg-surface-2 px-1.5 text-label font-semibold tracking-normal text-fg-muted tabular",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-4 py-4", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center gap-2 border-t border-border px-4 py-3", className)}
      {...props}
    />
  );
}

/**
 * Carte repliable (v4 lot 6) : même cadre que `Card`, en-tête compact cliquable (titre 15 / 600, compteur neutre,
 * chevron) ; remplace les `<details>` à sommaire en capitales (fiche d'une ligne, sections facultatives).
 */
function CardDisclosure({
  title,
  count,
  defaultOpen,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"details">, "title" | "open"> & {
  title: React.ReactNode;
  count?: number;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn("group chamfer shadow-rest [--frame:var(--card-frame)]", className)}
      {...props}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2 text-body font-semibold text-fg">
          <span className="title-rule truncate">{title}</span>
          {count !== undefined ? <Count>{count}</Count> : null}
        </span>
        <ChevronDown
          aria-hidden
          className="ml-auto size-4 shrink-0 text-fg-muted transition-transform duration-150 group-open:rotate-180"
        />
      </summary>
      <div className="flex flex-col gap-2 px-4 pb-4">{children}</div>
    </details>
  );
}

export { Card, CardContent, CardDisclosure, CardFooter, CardHeader, Count };
