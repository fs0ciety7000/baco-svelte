import { Inbox } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * État vide (v4, 15 oct. 2026) : par défaut **compact**, une ligne dans le cadre de la liste (icône 16 px, titre,
 * phrase d'aide à la suite, action à droite) ; `variant="first"` pour une première utilisation (grand cadre pointillé
 * centré, une phrase d'aide, une action).
 */
function EmptyState({
  title = "Aucune donnée",
  description,
  icon,
  action,
  variant = "compact",
  className,
}: {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  variant?: "compact" | "first";
  className?: string;
}) {
  if (variant === "first")
    return (
      <div
        data-slot="empty"
        data-variant="first"
        className={cn(
          "flex flex-col items-center gap-3 rounded-box border border-dashed border-border-strong px-6 py-10 text-center",
          className,
        )}
      >
        <span data-slot="empty-icon" className="text-fg-muted" aria-hidden>
          {icon ?? <Inbox className="size-6" />}
        </span>
        <p data-slot="empty-title" className="text-body font-semibold text-fg">
          {title}
        </p>
        {description ? (
          <p data-slot="empty-desc" className="max-w-sm text-body text-fg-muted">
            {description}
          </p>
        ) : null}
        {action}
      </div>
    );
  return (
    <div
      data-slot="empty"
      data-variant="compact"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-box bg-surface-2 px-3 py-2.5 text-left",
        className,
      )}
    >
      <span
        data-slot="empty-icon"
        className="text-fg-muted [&_svg]:size-4 [&_svg]:shrink-0"
        aria-hidden
      >
        {icon ?? <Inbox />}
      </span>
      <p className="min-w-0 flex-1 text-body">
        <span data-slot="empty-title" className="font-medium text-fg">
          {title}
        </span>
        {description ? (
          <span
            data-slot="empty-desc"
            className="text-fg-muted before:mx-1.5 before:text-fg-subtle before:content-['·']"
          >
            {description}
          </span>
        ) : null}
      </p>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

/** En-tête de page : eyebrow mono, un seul H1 display, actions groupées à droite, onglets en dessous. */
function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow ? <p className="label-mono text-fg-muted">{eyebrow}</p> : null}
          <h1 className="display text-h2 text-fg md:text-h1">{title}</h1>
          {description ? (
            <p className="max-w-2xl text-body-lg text-fg-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[min(var(--r-control),4px)] border border-b-2 border-border-strong bg-(--control-bg) px-1 font-mono text-[0.75rem] text-fg-muted",
        className,
      )}
      {...props}
    />
  );
}

// Statique (pas de boucle d'animation hors budget, DESIGN-DIRECTION.md § Motion).
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn("bg-[color-mix(in_oklab,var(--fg)_8%,var(--surface))]", className)}
      {...props}
    />
  );
}

export { EmptyState, Kbd, PageHeader, Skeleton };
