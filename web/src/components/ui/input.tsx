import * as React from "react";

import { cn } from "@/lib/utils";

// Champs : bordure border-strong (≥ 3:1), focus en accent, erreur via aria-invalid.
export const fieldBase =
  "w-full min-w-0 border border-border-strong bg-surface px-3 text-body text-fg placeholder:text-fg-muted transition-colors duration-150 outline-none hover:border-fg-muted focus-visible:border-accent focus-visible:outline-1 focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:focus-visible:outline-danger";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldBase,
        "h-control file:mr-3 file:border-0 file:bg-transparent file:text-small file:text-fg",
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
      className={cn(fieldBase, "min-h-24 py-2", className)}
      {...props}
    />
  );
}

// Select natif stylé : fiable au clavier, au lecteur d'écran et sur mobile (sélecteur du système).
function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(fieldBase, "h-control cursor-pointer appearance-none pr-9", className)}
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
