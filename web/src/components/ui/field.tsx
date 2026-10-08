"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import { Label } from "./label";

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  /** Le contrôle ; reçoit id, aria-describedby et aria-invalid. */
  children: React.ReactElement<Record<string, unknown>>;
};

// Libellé + aide + erreur reliés au contrôle (accessibilité : 1 libellé par champ, erreur annoncée).
function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = React.useId();
  const hintId = hint ? `${id}-aide` : undefined;
  const errorId = error ? `${id}-erreur` : undefined;
  const control = React.cloneElement(children, {
    id,
    "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined,
    "aria-invalid": error ? true : undefined,
    "aria-required": required || undefined,
  });
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="text-danger" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
      </Label>
      {control}
      {hint && !error ? (
        <p id={hintId} className="text-hint text-fg-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-hint text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { Field };
