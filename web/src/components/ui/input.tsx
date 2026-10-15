import * as React from "react";

import { cn } from "@/lib/utils";

// Champs (v4, 15 oct. 2026) : 38 px (`h-field`, 32 en compact, 44 au tactile), fond des contrôles du thème
// (`--control-bg` : surface le jour, surface-2 la nuit), bordure border-strong (≥ 3:1), halo de focus accent de 3 px,
// erreur via aria-invalid.
export const fieldBase =
  "focus-halo rounded-control w-full min-w-0 border border-border-strong bg-(--control-bg) px-3 text-body text-fg placeholder:text-fg-subtle transition-[border-color] duration-150 outline-none hover:border-fg-muted disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger";

/** Déclencheur de liste (Select, MultiSelect, Combobox en liste fermée) : même allure qu'un champ. */
export const triggerBase =
  "focus-halo flex min-h-field w-full min-w-0 cursor-pointer items-center gap-2 rounded-control border border-border-strong bg-(--control-bg) px-3 py-1.5 text-left text-body text-fg transition-[border-color] duration-150 outline-none hover:border-fg-muted disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldBase,
        "h-field file:mr-3 file:border-0 file:bg-transparent file:text-small file:text-fg",
        type === "number" && "tabular text-right",
        className,
      )}
      {...props}
    />
  );
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldBase, "min-h-24 rounded-box py-2", className)}
      {...props}
    />
  );
}

// Select natif stylé : ANCIEN, à ne plus utiliser (`Select` de `./select.tsx`). Reste seulement dans les écrans des
// lots R2 / R4 de la refonte (districts, listes longues : société, chauffeur, ligne, gares), à retirer ensuite.
function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(fieldBase, "h-field cursor-pointer appearance-none pr-9", className)}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-muted"
      >
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

export { Input, Select, Textarea };
