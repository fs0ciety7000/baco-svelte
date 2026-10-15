"use client";

import { Clock } from "lucide-react";
import * as React from "react";

import { isTime, nowTime, parseTimeText, stepTime, timeSegment } from "@/lib/dates/calendar";
import { cn } from "@/lib/utils";

import { useControllableValue, useFormBridge, useStopNativeChange } from "./form-bridge";
import { fieldBase } from "./input";

type TimeFieldProps = {
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (hhmm: string) => void;
  /** Pas des flèches ↑ ↓ sur les minutes (5 par défaut, décision du 14 oct. 2026). */
  step?: number;
  /** Heure encore inconnue (« à confirmer ») : affichée tant que le champ est vide. */
  pending?: boolean;
  /** Bouton « Maintenant » (par défaut). */
  now?: boolean;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean;
  "aria-label"?: string;
  "data-testid"?: string;
};

/**
 * Heure `HH:MM` sur 24 h, quelle que soit la langue du navigateur (plus de « 02:50 PM »). Saisie rapide : « 1450 » →
 * 14:50, « 945 » → 09:45, « 9 » → 09:00, « 14h50 » ; les deux-points s'ajoutent seuls. ↑ ↓ : ± 1 h sur les heures,
 * ± `step` minutes sur les minutes. Bouton « Maintenant ». `pending` : « À confirmer » tant que l'heure est vide
 * (les bons gardent leur drapeau `time_pending` : heure vide = à confirmer). Valeur `HH:MM` ou vide.
 */
function TimeField({
  name,
  value,
  defaultValue = "",
  onValueChange,
  step = 5,
  pending = false,
  now = true,
  placeholder,
  disabled = false,
  required,
  className,
  id: idProp,
  ...aria
}: TimeFieldProps) {
  const autoId = React.useId();
  const id = idProp ?? autoId;
  const [current, setCurrent] = useControllableValue(value, defaultValue, onValueChange);
  const bridge = useFormBridge(current);
  const inputRef = React.useRef<HTMLInputElement>(null);
  useStopNativeChange(inputRef);
  const [text, setText] = React.useState(current);
  const [synced, setSynced] = React.useState(current);
  if (synced !== current) {
    setSynced(current);
    if (parseTimeText(text) !== current) setText(current);
  }

  const commit = (v: string) => {
    setText(v);
    if (v !== current) {
      bridge.markUserChange();
      setCurrent(v);
    }
    return v;
  };
  const settle = () => {
    if (!text.trim()) return commit("");
    const t = parseTimeText(text);
    if (t) return commit(t);
    setText(current);
    return current;
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputType = (e.nativeEvent as InputEvent).inputType ?? "insertText";
    let next = e.target.value;
    if (!inputType.startsWith("delete")) {
      if (/^\d{4}$/.test(next)) next = `${next.slice(0, 2)}:${next.slice(2)}`;
      else if (/^\d{2}$/.test(next) && Number(next) <= 23) next = `${next}:`;
    }
    setText(next);
    if (!next.trim()) commit("");
    else if (isTime(next) && next !== current) {
      bridge.markUserChange();
      setCurrent(next);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const dir = e.key === "ArrowUp" ? 1 : -1;
      const seg = timeSegment(e.currentTarget.selectionStart ?? 0);
      const base = parseTimeText(text) ?? (isTime(current) ? current : "");
      const next = !base
        ? stepTime(nowTime(), 0, step)
        : seg === "h"
          ? stepTime(base, 60 * dir)
          : stepTime(base, step * dir, step);
      commit(next);
      requestAnimationFrame(() => {
        const [a, b] = seg === "h" ? [0, 2] : [3, 5];
        inputRef.current?.setSelectionRange(a, b);
      });
      return;
    }
    if (e.key === "Enter") {
      const before = current;
      if (settle() !== before) e.preventDefault();
    }
  };

  const ph = placeholder ?? (pending ? "À confirmer" : "hh:mm");

  return (
    <>
      <div className={cn("relative min-w-0", className)}>
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          maxLength={5}
          placeholder={ph}
          value={text}
          disabled={disabled}
          required={required}
          aria-describedby={aria["aria-describedby"]}
          aria-invalid={aria["aria-invalid"]}
          aria-required={aria["aria-required"]}
          aria-label={aria["aria-label"]}
          aria-description={pending && !current ? "Heure à confirmer" : undefined}
          data-testid={aria["data-testid"]}
          data-slot="time-field"
          data-pending={(pending && !current) || undefined}
          onChange={onChange}
          onBlur={settle}
          onKeyDown={onKeyDown}
          className={cn(
            fieldBase,
            "h-field tabular",
            now && "pr-11",
            pending && !current && "border-dashed placeholder:text-warn",
          )}
        />
        {now ? (
          <button
            type="button"
            aria-label="Maintenant"
            title="Maintenant"
            disabled={disabled}
            onClick={() => {
              commit(nowTime());
              inputRef.current?.focus({ preventScroll: true });
            }}
            className="absolute top-1/2 right-1 grid size-control-sm -translate-y-1/2 cursor-pointer place-items-center rounded-control text-fg-muted hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Clock className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
      {name ? <input ref={bridge.ref} type="hidden" name={name} value={current} readOnly /> : null}
    </>
  );
}

export { TimeField };
