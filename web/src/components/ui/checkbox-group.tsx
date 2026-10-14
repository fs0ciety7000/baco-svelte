"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import { Checkbox } from "./checkbox";
import { useControllableValue, useMultiFormBridge } from "./form-bridge";
import type { ListOption } from "./listbox";

/**
 * Groupe de cases à cocher (refonte R4, 14 oct. 2026) : `fieldset` + `legend`, cases Radix (`Checkbox`) avec cible
 * de 44 px au doigt (libellé englobant), « Tout cocher » facultatif. Remplace les cases natives (filtre de statut des
 * Missions PMR, procédures). Valeurs en champs cachés répétés (`?statut=a&statut=b`), un `change` natif par case
 * cochée (filtres GET : `FormAutoSubmit`). Aucune case = aucune valeur envoyée.
 */
function CheckboxGroup<T extends string>({
  legend,
  name,
  options,
  values,
  defaultValues = [],
  onValuesChange,
  checkAll = false,
  orientation = "row",
  hideLegend = false,
  disabled = false,
  className,
  "data-testid": testId,
}: {
  legend: string;
  name?: string;
  options: ListOption<T>[];
  values?: T[];
  defaultValues?: T[];
  onValuesChange?: (values: T[]) => void;
  /** Bouton « Tout cocher » / « Tout décocher ». */
  checkAll?: boolean;
  orientation?: "row" | "column";
  /** Légende lue par les lecteurs d'écran seulement (le libellé est déjà visible ailleurs). */
  hideLegend?: boolean;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}) {
  const [current, setCurrent] = useControllableValue<T[]>(values, defaultValues, onValuesChange);
  const ordered = options.map((o) => o.value).filter((v) => current.includes(v));
  const bridge = useMultiFormBridge(ordered);
  const enabled = options.filter((o) => !o.disabled).map((o) => o.value);
  const allOn = enabled.length > 0 && enabled.every((v) => ordered.includes(v));
  const set = (next: T[]) => {
    bridge.markUserChange();
    setCurrent(options.map((o) => o.value).filter((v) => next.includes(v)));
  };
  const id = React.useId();
  return (
    <fieldset
      disabled={disabled}
      data-testid={testId}
      data-slot="checkbox-group"
      className={cn("flex min-w-0 flex-col gap-1", className)}
    >
      <legend className={cn("mb-1 text-small text-fg-muted", hideLegend && "sr-only")}>
        {legend}
      </legend>
      <span
        className={cn(
          orientation === "row" ? "flex flex-wrap gap-x-4 gap-y-0.5" : "flex flex-col gap-0.5",
        )}
      >
        {options.map((o, i) => {
          const on = ordered.includes(o.value);
          return (
            <label
              key={o.value}
              htmlFor={`${id}-${i}`}
              className={cn(
                "inline-flex min-h-11 cursor-pointer items-center gap-2 text-body text-fg md:min-h-control",
                o.disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <Checkbox
                id={`${id}-${i}`}
                checked={on}
                disabled={o.disabled}
                value={o.value}
                onCheckedChange={(c) =>
                  set(c === true ? [...ordered, o.value] : ordered.filter((v) => v !== o.value))
                }
              />
              <span className="flex min-w-0 flex-col">
                <span>{o.label}</span>
                {o.hint ? <span className="text-small text-fg-muted">{o.hint}</span> : null}
              </span>
            </label>
          );
        })}
        {checkAll ? (
          <button
            type="button"
            onClick={() => set(allOn ? [] : enabled)}
            className="link inline-flex min-h-11 cursor-pointer items-center text-small md:min-h-control"
          >
            {allOn ? "Tout décocher" : "Tout cocher"}
          </button>
        ) : null}
      </span>
      {name ? (
        <>
          <span ref={bridge.ref} hidden />
          {ordered.map((v) => (
            <input key={v} type="hidden" name={name} value={v} />
          ))}
        </>
      ) : null}
    </fieldset>
  );
}

export { CheckboxGroup };
