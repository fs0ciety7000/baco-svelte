"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { Check } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer grid size-5 shrink-0 cursor-pointer place-items-center rounded-[min(var(--r-control),5px)] border border-border-strong bg-surface transition-colors hover:border-fg-muted disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-fg",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-3.5" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

/**
 * Interrupteur (Radix) à la forme du thème (`rounded-control` : angle, arrondi ou pilule). En tactile, la zone
 * cliquable est agrandie à 44 px par un pseudo-élément ; avec un libellé, préférer `SwitchField` (libellé englobant).
 */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-control border border-border-strong bg-surface-2 p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-accent data-[state=checked]:bg-[color-mix(in_oklab,var(--accent)_25%,var(--surface))] pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-2.5",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-4 rounded-[max(0px,calc(var(--r-control)-2px))] bg-fg-muted transition-transform duration-150 ease-hud data-[state=checked]:translate-x-4 data-[state=checked]:bg-accent" />
    </SwitchPrimitive.Root>
  );
}

/**
 * Interrupteur + libellé : tout le libellé est cliquable (`<label>` englobant), hauteur 44 px au moins (cible tactile).
 * `hint` s'affiche sous le libellé ; `reverse` met l'interrupteur à droite (réglages).
 */
function SwitchField({
  label,
  hint,
  reverse = false,
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  label: React.ReactNode;
  hint?: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <label
      data-slot="switch-field"
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 text-body has-[:disabled]:cursor-not-allowed",
        reverse && "justify-between",
        className,
      )}
    >
      {reverse ? null : <Switch {...props} />}
      <span className="flex min-w-0 flex-col">
        <span>{label}</span>
        {hint ? <span className="text-small text-fg-muted">{hint}</span> : null}
      </span>
      {reverse ? <Switch {...props} /> : null}
    </label>
  );
}

export { Checkbox, Switch, SwitchField };
