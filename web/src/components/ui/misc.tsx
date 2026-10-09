import { Inbox } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/** État vide : bordure pointillée, label mono, une phrase d'aide, une action. */
function EmptyState({
  title = "Aucune donnée",
  description,
  icon,
  action,
  className,
}: {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 border border-dashed border-border-strong px-6 py-10 text-center",
        className,
      )}
    >
      <span className="text-fg-muted" aria-hidden>
        {icon ?? <Inbox className="size-6" />}
      </span>
      <p className="label-mono text-fg">{title}</p>
      {description ? <p className="max-w-sm text-body text-fg-muted">{description}</p> : null}
      {action}
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
        "inline-flex h-5 min-w-5 items-center justify-center border border-border-strong bg-surface-2 px-1 font-mono text-[0.6875rem] text-fg-muted",
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
