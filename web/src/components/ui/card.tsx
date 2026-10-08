import * as React from "react";

import { cn } from "@/lib/utils";

// Panneau chanfreiné : la profondeur vient du contraste des surfaces, pas d'ombre diffuse.
function Card({
  className,
  tone,
  ...props
}: React.ComponentProps<"div"> & { tone?: "default" | "raised" | "live" }) {
  return (
    <div
      data-slot="card"
      className={cn(
        "chamfer flex flex-col",
        tone === "raised" && "[--fill:var(--surface-2)]",
        tone === "live" && "[--frame:color-mix(in_oklab,var(--accent)_55%,var(--border))]",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({
  className,
  eyebrow,
  title,
  actions,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-4 pt-4", className)} {...props}>
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow ? <p className="label-mono text-fg-muted">{eyebrow}</p> : null}
        {title ? <h3 className="truncate text-body-lg font-semibold">{title}</h3> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
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

export { Card, CardContent, CardFooter, CardHeader };
