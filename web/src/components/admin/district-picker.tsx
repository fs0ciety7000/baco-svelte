"use client";

import { Check } from "lucide-react";

import { DISTRICT_SHORT } from "@/lib/team";
import { cn } from "@/lib/utils";

export const DISTRICT_NAMES = ["Sud-Ouest", "Sud-Est", "Centre"] as const;

/**
 * Districts permanents d'un compte (rôles v2, 11 oct. 2026) : un, deux ou les trois. Ils règlent les filtres et les
 * alertes par défaut (comme les districts du jour) ; ils ne limitent pas l'écriture.
 */
export function DistrictPicker({
  value,
  onChange,
  label = "Districts",
  ...aria
}: {
  value: string[];
  onChange: (next: string[]) => void;
  label?: string;
  /** Posés par `Field` (id, aide). */
  id?: string;
  "aria-describedby"?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      id={aria.id}
      aria-describedby={aria["aria-describedby"]}
      className="flex flex-wrap gap-2"
    >
      {DISTRICT_NAMES.map((d) => {
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() =>
              onChange(DISTRICT_NAMES.filter((x) => (x === d ? !on : value.includes(x))))
            }
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-3 text-small transition-colors",
              on
                ? "border-accent bg-accent-soft text-fg"
                : "border-border-strong bg-surface text-fg-muted hover:border-fg-muted",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-4 place-items-center border",
                on ? "border-accent bg-accent text-accent-fg" : "border-border-strong",
              )}
            >
              {on ? <Check className="size-3" strokeWidth={3} /> : null}
            </span>
            <span className="font-mono">{DISTRICT_SHORT[d]}</span>
            <span className="hidden sm:inline">{d}</span>
          </button>
        );
      })}
    </div>
  );
}
