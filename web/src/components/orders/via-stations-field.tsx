"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { moveVia, VIA_MAX } from "@/lib/orders/via";
import type { StationRef } from "@/lib/stations/search";

import { StationInput } from "./station-input";

/**
 * Gares « via » d'un bon taxi (demande du 14 oct. 2026) : liste ordonnée d'étapes, chacune avec le champ de gare du
 * référentiel (nom corrigé à la sortie du champ), ajout, retrait, monter / descendre. Une ligne vide reste pendant la
 * saisie ; elle est ignorée à l'enregistrement (`cleanVias`).
 */
export function ViaStationsField({
  value,
  onChange,
  refs,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  refs: StationRef[];
  disabled?: boolean;
}) {
  const id = useId();
  const setAt = (i: number, v: string) => onChange(value.map((x, j) => (j === i ? v : x)));
  return (
    <fieldset className="flex min-w-0 flex-col gap-2" data-testid="via-list">
      <legend className="mb-1.5 text-small font-medium text-fg">
        Via{" "}
        <span className="font-normal text-fg-muted">(facultatif, dans l&apos;ordre du trajet)</span>
      </legend>
      {value.length === 0 ? (
        <p className="text-small text-fg-muted">Aucune gare via : trajet direct.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {value.map((v, i) => (
            <li key={i} className="flex min-w-0 items-center gap-1.5" data-testid={`via-row-${i}`}>
              <span
                className="w-6 shrink-0 text-center font-mono text-small text-fg-muted tabular"
                aria-hidden
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <StationInput
                  id={`${id}-${i}`}
                  value={v}
                  onChange={(s) => setAt(i, s)}
                  refs={refs}
                  disabled={disabled}
                  aria-label={`Gare via ${i + 1}`}
                  data-testid={`via-input-${i}`}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Monter la gare via ${i + 1}`}
                disabled={disabled || i === 0}
                onClick={() => onChange(moveVia(value, i, -1))}
                data-testid={`via-up-${i}`}
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Descendre la gare via ${i + 1}`}
                disabled={disabled || i === value.length - 1}
                onClick={() => onChange(moveVia(value, i, 1))}
                data-testid={`via-down-${i}`}
              >
                <ArrowDown />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Retirer la gare via ${i + 1}`}
                disabled={disabled}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                data-testid={`via-remove-${i}`}
              >
                <X />
              </Button>
            </li>
          ))}
        </ol>
      )}
      {!disabled && value.length < VIA_MAX ? (
        <Button
          type="button"
          variant="ghost"
          className="self-start border border-border"
          onClick={() => onChange([...value, ""])}
          data-testid="via-add"
        >
          <Plus aria-hidden /> Ajouter une gare via
        </Button>
      ) : null}
    </fieldset>
  );
}
