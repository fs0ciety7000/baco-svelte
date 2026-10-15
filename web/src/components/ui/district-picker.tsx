"use client";

import { Check, MapPin } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

import { DISTRICT_CODE_OPTIONS, type DistrictOption } from "@/lib/district-param";

import { CHIP_BASE, CHIP_OFF, CHIP_ON } from "./chip-styles";
import { useControllableValue, useMultiFormBridge } from "./form-bridge";

const chip = cn(
  CHIP_BASE,
  "min-h-11 gap-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent md:min-h-control-sm",
);
const chipOn = CHIP_ON;
const chipOff = CHIP_OFF;

/**
 * Choix des districts en puces toujours visibles (refonte R4, 14 oct. 2026) : un, plusieurs ou aucun (« Tous »).
 * `role="group"`, chaque puce est un bouton `aria-pressed`. Valeurs envoyées en champs cachés répétés
 * (`?district=DSO&district=DSE`) ; sans valeur, `emptyValue` part s'il est donné (« tous » : lève un filtre par défaut).
 * Chaque bascule émet un `change` (filtres GET : `FormAutoSubmit`). `mine` : puce « Mes districts » (districts du jour).
 * `layout="stack"` : une puce par ligne, nom complet (dialogue des districts du jour).
 */
function DistrictPicker({
  name,
  options = DISTRICT_CODE_OPTIONS,
  values,
  defaultValues = [],
  onValuesChange,
  allLabel = "Tous",
  emptyValue,
  mine,
  mineLabel = "Mes districts",
  layout = "row",
  showHint = "wide",
  disabled = false,
  label = "District",
  className,
  id,
  "aria-describedby": describedBy,
  "data-testid": testId,
}: {
  name?: string;
  options?: DistrictOption[];
  values?: string[];
  defaultValues?: string[];
  onValuesChange?: (values: string[]) => void;
  /** Libellé de la puce « aucun filtre » ; `null` : pas de puce (choix d'un compte). */
  allLabel?: string | null;
  emptyValue?: string;
  mine?: string[];
  mineLabel?: string;
  layout?: "row" | "stack";
  /** Nom complet à côté du code : toujours, dès 640 px (`wide`), jamais. */
  showHint?: "always" | "wide" | "never";
  disabled?: boolean;
  label?: string;
  className?: string;
  id?: string;
  "aria-describedby"?: string;
  "data-testid"?: string;
}) {
  const [current, setCurrent] = useControllableValue<string[]>(
    values,
    defaultValues,
    onValuesChange,
  );
  // Ordre des options, sans valeur inconnue.
  const ordered = React.useMemo(
    () => options.map((o) => o.value).filter((v) => current.includes(v)),
    [options, current],
  );
  const bridge = useMultiFormBridge(ordered);
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((v) => b.includes(v));
  const set = (next: string[]) => {
    const clean = options.map((o) => o.value).filter((v) => next.includes(v));
    if (same(clean, ordered)) return;
    bridge.markUserChange();
    setCurrent(clean);
  };
  const stack = layout === "stack";
  const hint = (o: DistrictOption) =>
    o.hint && showHint !== "never" ? (
      <span
        className={cn(
          "font-normal",
          stack ? "text-body text-fg" : "text-fg-muted",
          showHint === "wide" && !stack && "hidden sm:inline",
        )}
      >
        {o.hint}
      </span>
    ) : null;

  return (
    <div
      role="group"
      aria-label={label}
      id={id}
      aria-describedby={describedBy}
      data-testid={testId}
      data-slot="district-picker"
      className={cn(stack ? "flex flex-col gap-2" : "flex flex-wrap gap-1.5", className)}
    >
      {allLabel !== null ? (
        <button
          type="button"
          aria-pressed={ordered.length === 0}
          disabled={disabled}
          onClick={() => set([])}
          className={cn(chip, ordered.length === 0 ? chipOn : chipOff)}
          data-value=""
        >
          {allLabel}
        </button>
      ) : null}
      {mine && mine.length ? (
        <button
          type="button"
          aria-pressed={same(ordered, mine)}
          disabled={disabled}
          onClick={() => set(mine)}
          className={cn(chip, same(ordered, mine) ? chipOn : chipOff)}
          data-testid="my-districts"
        >
          <MapPin aria-hidden className="size-4" />
          {mineLabel}
        </button>
      ) : null}
      {options.map((o) => {
        const on = ordered.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            title={o.hint}
            data-value={o.value}
            onClick={() => set(on ? ordered.filter((v) => v !== o.value) : [...ordered, o.value])}
            className={cn(chip, on ? chipOn : chipOff, stack && "min-h-12 justify-start text-left")}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-4 shrink-0 place-items-center rounded-[min(var(--r-control),4px)] border",
                on ? "border-accent bg-accent text-accent-fg" : "border-border-strong",
              )}
            >
              {on ? <Check className="size-3" strokeWidth={3} /> : null}
            </span>
            <span className="font-mono">{o.label}</span>
            {hint(o)}
          </button>
        );
      })}
      {name ? (
        <>
          <span ref={bridge.ref} hidden />
          {ordered.map((v) => (
            <input key={v} type="hidden" name={name} value={v} />
          ))}
          {!ordered.length && emptyValue !== undefined ? (
            <input type="hidden" name={name} value={emptyValue} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export { DistrictPicker };
