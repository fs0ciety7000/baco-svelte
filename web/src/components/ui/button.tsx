import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

// Bouton CSM. Primaire = chanfreiné, fond accent (une seule action primaire par zone).
const buttonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 font-medium whitespace-nowrap select-none transition-[background-color,color,border-color,transform] duration-150 ease-hud active:translate-y-px disabled:pointer-events-none disabled:not-aria-busy:opacity-45 aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary:
          "chamfer chamfer-sm text-accent-fg [--fill:var(--accent)] [--frame:var(--accent)] hover:[--fill:color-mix(in_oklab,var(--accent)_88%,var(--fg))]",
        secondary:
          "border border-border-strong bg-surface text-fg hover:border-fg-muted hover:bg-surface-2",
        ghost: "text-fg hover:bg-surface-2",
        danger:
          "border border-danger/60 bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] text-danger hover:bg-[color-mix(in_oklab,var(--danger)_18%,transparent)]",
        link: "h-auto px-0 text-accent underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-control-sm px-3 text-small",
        md: "h-control px-4 text-body",
        lg: "h-12 px-6 text-body-lg",
        icon: "size-control",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </Comp>
  );
}

export { Button, buttonVariants };
