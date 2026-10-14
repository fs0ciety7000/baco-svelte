"use client";

import { Train, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { orderTrain, type OrderTrain } from "@/app/(app)/commandes/train-actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { daysLabel } from "@/lib/timetable/model";

// N° de train d'un bon (bus ou taxi, demande du 14 oct. 2026) : le train est cherché dans le référentiel des trains
// (variante qui circule le jour du bon) et son trajet est proposé. Un bon sans gare d'arrivée le reprend d'office ; sinon
// le rédacteur choisit « Reprendre le trajet du train ». Toujours annulable, tout reste modifiable.

type Lookup =
  | { state: "idle" }
  | { state: "loading"; number: string }
  | { state: "found"; number: string; train: OrderTrain }
  | { state: "unknown"; number: string };

export function trainSummary(t: OrderTrain): string {
  const first = t.stops[0];
  const last = t.stops.at(-1);
  const dep = first?.d || first?.a || "";
  const arr = last?.a || last?.d || "";
  return [
    t.relation && t.relation !== t.type ? t.relation : "",
    `${t.origin}${dep ? ` ${dep}` : ""} → ${t.terminus}${arr ? ` ${arr}` : ""}`,
    daysLabel(t.days),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function TrainNumberField({
  value,
  onChange,
  day,
  disabled,
  autoApply,
  onApply,
  onUndo,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Jour du bon (« AAAA-MM-JJ ») : variante du train qui circule ce jour-là. */
  day: string;
  disabled?: boolean;
  /** Vrai : le trajet du train est repris dès qu'il est trouvé (bon sans gare d'arrivée). */
  autoApply: boolean;
  onApply: (train: OrderTrain) => void;
  /** Présent juste après une reprise : rétablit le bon d'avant. */
  onUndo: (() => void) | null;
}) {
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  // Un bon rouvert avec un n° déjà saisi n'est jamais modifié d'office.
  const applied = useRef(value.trim() ? `${value.trim()}|${day}` : "");
  const autoRef = useRef(autoApply);
  const applyRef = useRef(onApply);
  useEffect(() => {
    autoRef.current = autoApply;
    applyRef.current = onApply;
  });

  useEffect(() => {
    const number = value.trim();
    if (number.length < 2) {
      setLookup({ state: "idle" });
      return;
    }
    let live = true;
    const t = setTimeout(async () => {
      setLookup({ state: "loading", number });
      const train = await orderTrain({ number, day }).catch(() => null);
      if (!live) return;
      if (!train) return setLookup({ state: "unknown", number });
      setLookup({ state: "found", number, train });
      // Reprise d'office : une fois par n°, seulement si le bon n'a pas encore de gares.
      if (autoRef.current && applied.current !== `${number}|${day}`) {
        applied.current = `${number}|${day}`;
        applyRef.current(train);
      }
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [value, day]);

  const found = lookup.state === "found" && lookup.number === value.trim() ? lookup.train : null;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Field
        label="N° de train"
        hint={
          found
            ? undefined
            : "Facultatif : un n° de train remplit le trajet (gares, lignes, arrêts)."
        }
      >
        <Input
          value={value}
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          placeholder="Ex. 1706"
          disabled={disabled}
          data-testid="train-number"
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
      </Field>
      <div aria-live="polite" className="flex min-w-0 flex-col gap-2">
        {found ? (
          <div
            className="flex min-w-0 flex-col gap-2 rounded-box border border-border bg-surface-2 p-3"
            data-testid="train-info"
          >
            <p className="flex min-w-0 items-start gap-2 text-small text-fg">
              <Train aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-muted" />
              <span className="min-w-0">
                <span className="font-medium">
                  {found.type} {found.number}
                </span>{" "}
                · {trainSummary(found)}
                {found.variants > 1 ? (
                  <span className="text-fg-muted"> (variante du jour du bon)</span>
                ) : null}
              </span>
            </p>
            {!disabled ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    applied.current = `${found.number}|${day}`;
                    onApply(found);
                  }}
                  data-testid="train-apply"
                >
                  Reprendre le trajet du train
                </Button>
                {onUndo ? (
                  <Button type="button" variant="ghost" onClick={onUndo} data-testid="train-undo">
                    <Undo2 aria-hidden /> Annuler la reprise
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : lookup.state === "unknown" && lookup.number === value.trim() ? (
          <p className="text-small text-fg-muted">
            Train {lookup.number} absent du référentiel des trains : saisis le trajet à la main.
          </p>
        ) : lookup.state === "loading" ? (
          <p className="text-small text-fg-muted">Recherche du train…</p>
        ) : null}
      </div>
    </div>
  );
}
