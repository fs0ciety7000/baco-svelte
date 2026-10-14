"use client";

import { CalendarDays } from "lucide-react";
import * as React from "react";

import {
  addDays,
  clampDate,
  dateSegment,
  endOfWeek,
  formatDateFr,
  isIsoDate,
  maskDateDigits,
  parseDateText,
  startOfWeek,
  stepDate,
  todayIso,
} from "@/lib/dates/calendar";
import { cn } from "@/lib/utils";

import { Calendar } from "./calendar";
import { useControllableValue, useFormBridge, useStopNativeChange } from "./form-bridge";
import { fieldBase } from "./input";
import { PickerSurface, usePickerSheet } from "./popover";
import { labelText } from "./select";

type AriaProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean;
  "aria-label"?: string;
  "data-testid"?: string;
};

type DateFieldProps = AriaProps & {
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (iso: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** Titre de la feuille du bas (mobile) ; à défaut, le texte du libellé du champ. */
  label?: string;
  className?: string;
  /** Contenu ajouté en tête du calendrier (raccourcis du DateRangePicker) ; reçoit de quoi fermer. */
  calendarHeader?: (close: () => void) => React.ReactNode;
  /** Période surlignée dans le calendrier. */
  range?: { from?: string; to?: string };
};

const BUTTON =
  "absolute top-1/2 right-1 grid size-control-sm -translate-y-1/2 cursor-pointer place-items-center rounded-control text-fg-muted hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Date au format belge `jj/mm/aaaa` quelle que soit la langue du navigateur (le `type="date"` natif affichait
 * mm/dd/yyyy sur un poste en anglais). Saisie au clavier : « 14102026 », « 141026 », « 14/10 » (année en cours) ou
 * « 14 » (mois en cours) sont complétés à la sortie du champ ; ↑ ↓ changent le segment sous le curseur (jour, mois,
 * année) ; Alt + ↓ ouvre le calendrier. Valeur ISO (`AAAA-MM-JJ`) dans `onValueChange` et dans le champ caché `name`.
 */
function DateField({
  name,
  value,
  defaultValue = "",
  onValueChange,
  min,
  max,
  placeholder = "jj/mm/aaaa",
  disabled = false,
  required,
  label,
  className,
  calendarHeader,
  range,
  id: idProp,
  ...aria
}: DateFieldProps) {
  const autoId = React.useId();
  const id = idProp ?? autoId;
  const [current, setCurrent] = useControllableValue(value, defaultValue, onValueChange);
  const bridge = useFormBridge(current);
  const sheet = usePickerSheet();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  useStopNativeChange(inputRef);
  const [text, setText] = React.useState(() => formatDateFr(current));
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState(label ?? "");

  // Valeur changée par le parent (ou raccourci) : le texte suit, sauf s'il désigne déjà cette date.
  const [synced, setSynced] = React.useState(current);
  if (synced !== current) {
    setSynced(current);
    if (parseDateText(text) !== current) setText(formatDateFr(current));
  }

  const commit = (iso: string) => {
    const v = iso ? clampDate(iso, min, max) : "";
    setText(formatDateFr(v));
    if (v !== current) {
      bridge.markUserChange();
      setCurrent(v);
    }
    return v;
  };

  /** Texte saisi → valeur ; texte illisible : on revient à la dernière valeur valide. */
  const settle = () => {
    if (!text.trim()) return commit("");
    const iso = parseDateText(text);
    if (iso) return commit(iso);
    setText(formatDateFr(current));
    return current;
  };

  const openCalendar = () => {
    if (disabled) return;
    setTitle(label ?? (labelText(inputRef.current) || "Choisir une date"));
    setOpen(true);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputType = (e.nativeEvent as InputEvent).inputType ?? "insertText";
    const raw = e.target.value;
    const next = inputType.startsWith("delete") ? raw : maskDateDigits(raw);
    setText(next);
    if (!next.trim()) {
      commit("");
      return;
    }
    // Date complète tapée (« 14/10/2026 ») : prise en compte aussitôt, sans attendre la sortie du champ.
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(next)) {
      const iso = parseDateText(next);
      if (iso && (!min || iso >= min) && (!max || iso <= max)) {
        if (iso !== current) {
          bridge.markUserChange();
          setCurrent(iso);
        }
      }
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && e.altKey) {
      e.preventDefault();
      openCalendar();
      return;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const el = e.currentTarget;
      const caret = el.selectionStart ?? 0;
      const seg = dateSegment(caret);
      const base = parseDateText(text) ?? (isIsoDate(current) ? current : "");
      const next = base ? stepDate(base, seg, e.key === "ArrowUp" ? 1 : -1) : todayIso();
      commit(next);
      // Le curseur reste dans le segment modifié.
      requestAnimationFrame(() => {
        const [a, b] = seg === "d" ? [0, 2] : seg === "m" ? [3, 5] : [6, 10];
        inputRef.current?.setSelectionRange(a, b);
      });
      return;
    }
    if (e.key === "Enter") {
      const before = current;
      const after = settle();
      // Valeur modifiée : pas de soumission implicite avec l'ancienne valeur ; le pont émet `change` au rendu suivant.
      if (after !== before) e.preventDefault();
    }
  };

  const select = (iso: string) => {
    commit(iso);
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  };

  return (
    <>
      <PickerSurface
        open={open}
        onOpenChange={(o) => (o ? openCalendar() : setOpen(false))}
        sheet={sheet}
        modal
        title={title}
        triggerRef={buttonRef}
        role={sheet ? undefined : "dialog"}
        aria-label={sheet ? undefined : "Choisir une date"}
        className={sheet ? "px-1" : "w-80"}
        onOpenAutoFocus={(e) => e.preventDefault()}
        anchor={
          <div ref={wrapRef} className={cn("relative min-w-0", className)}>
            <input
              ref={inputRef}
              id={id}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              maxLength={10}
              placeholder={placeholder}
              value={text}
              disabled={disabled}
              required={required}
              aria-describedby={aria["aria-describedby"]}
              aria-invalid={aria["aria-invalid"]}
              aria-required={aria["aria-required"]}
              aria-label={aria["aria-label"]}
              data-testid={aria["data-testid"]}
              data-slot="date-field"
              onChange={onChange}
              onBlur={settle}
              onKeyDown={onKeyDown}
              className={cn(fieldBase, "h-control pr-11 tabular")}
            />
            <button
              ref={buttonRef}
              type="button"
              aria-label="Ouvrir le calendrier"
              aria-haspopup="dialog"
              aria-expanded={open}
              disabled={disabled}
              onClick={() => (open ? setOpen(false) : openCalendar())}
              className={BUTTON}
            >
              <CalendarDays className="size-4" aria-hidden />
            </button>
          </div>
        }
      >
        {open ? (
          <>
            {calendarHeader?.(() => setOpen(false))}
            <Calendar
              value={current}
              min={min}
              max={max}
              range={range}
              onSelect={select}
              autoFocus
              touch={sheet}
            />
          </>
        ) : null}
      </PickerSurface>
      {name ? <input ref={bridge.ref} type="hidden" name={name} value={current} readOnly /> : null}
    </>
  );
}

// ── Période ──────────────────────────────────────────────────────────────────────────────────────

export type RangePreset = "today" | "tomorrow" | "7d" | "last7" | "week";

const PRESET_LABEL: Record<RangePreset, string> = {
  today: "Aujourd'hui",
  tomorrow: "Demain",
  "7d": "7 jours",
  last7: "7 derniers jours",
  week: "Semaine",
};

export function presetRange(p: RangePreset, today = todayIso()): { from: string; to: string } {
  switch (p) {
    case "today":
      return { from: today, to: today };
    case "tomorrow":
      return { from: addDays(today, 1), to: addDays(today, 1) };
    case "7d":
      return { from: today, to: addDays(today, 6) };
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "week":
      return { from: startOfWeek(today), to: endOfWeek(today) };
  }
}

/**
 * Période « Du » / « Au » : deux DateField dont le calendrier propose aussi des raccourcis (Aujourd'hui, Demain,
 * 7 jours, Semaine…). « Au » ne peut précéder « Du » (l'autre borne suit). Champs cachés `nameFrom` / `nameTo` : un
 * raccourci change les deux puis émet un seul `change` (une seule soumission des filtres).
 */
function DateRangePicker({
  nameFrom,
  nameTo,
  valueFrom,
  valueTo,
  defaultFrom = "",
  defaultTo = "",
  onValueChange,
  labelFrom = "Du",
  labelTo = "Au",
  presets = ["today", "tomorrow", "7d", "week"],
  min,
  max,
  disabled,
  fieldClassName,
  labelClassName = "text-small text-fg-muted",
}: {
  nameFrom?: string;
  nameTo?: string;
  valueFrom?: string;
  valueTo?: string;
  defaultFrom?: string;
  defaultTo?: string;
  onValueChange?: (range: { from: string; to: string }) => void;
  labelFrom?: string;
  labelTo?: string;
  presets?: RangePreset[];
  min?: string;
  max?: string;
  disabled?: boolean;
  /** Classe de chaque bloc libellé + champ (ex. `md:w-40` dans une barre de filtres). */
  fieldClassName?: string;
  labelClassName?: string;
}) {
  const controlled = valueFrom !== undefined || valueTo !== undefined;
  const [inner, setInner] = React.useState({ from: defaultFrom, to: defaultTo });
  const range = controlled ? { from: valueFrom ?? "", to: valueTo ?? "" } : inner;
  const fromRef = React.useRef<HTMLInputElement>(null);
  const toRef = React.useRef<HTMLInputElement>(null);
  const pending = React.useRef(false);

  React.useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    (toRef.current ?? fromRef.current)?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [range.from, range.to]);

  const update = (next: { from: string; to: string }) => {
    if (next.from === range.from && next.to === range.to) return;
    pending.current = true;
    if (!controlled) setInner(next);
    onValueChange?.(next);
  };
  const setFrom = (from: string) =>
    update({ from, to: from && range.to && range.to < from ? from : range.to });
  const setTo = (to: string) =>
    update({ from: to && range.from && range.from > to ? to : range.from, to });

  const header = (close: () => void) =>
    presets.length ? (
      <div
        role="group"
        aria-label="Raccourcis"
        className="flex flex-wrap gap-1.5 border-b border-border p-3 pb-2"
      >
        {presets.map((p) => {
          const r = presetRange(p);
          const on = r.from === range.from && r.to === range.to;
          return (
            <button
              key={p}
              type="button"
              aria-pressed={on}
              onClick={() => {
                update(r);
                close();
              }}
              className={cn(
                "min-h-control-sm cursor-pointer rounded-control border px-2.5 text-small font-medium",
                on
                  ? "border-accent bg-accent-soft text-fg"
                  : "border-border text-fg-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              {PRESET_LABEL[p]}
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <>
      <label className={cn("flex min-w-0 flex-col gap-1", fieldClassName)}>
        <span className={labelClassName}>{labelFrom}</span>
        <DateField
          value={range.from}
          onValueChange={setFrom}
          min={min}
          max={max}
          disabled={disabled}
          label={labelFrom}
          calendarHeader={header}
          range={range}
        />
      </label>
      <label className={cn("flex min-w-0 flex-col gap-1", fieldClassName)}>
        <span className={labelClassName}>{labelTo}</span>
        <DateField
          value={range.to}
          onValueChange={setTo}
          min={min}
          max={max}
          disabled={disabled}
          label={labelTo}
          calendarHeader={header}
          range={range}
        />
      </label>
      {nameFrom ? (
        <input ref={fromRef} type="hidden" name={nameFrom} value={range.from} readOnly />
      ) : null}
      {nameTo ? <input ref={toRef} type="hidden" name={nameTo} value={range.to} readOnly /> : null}
    </>
  );
}

export { DateField, DateRangePicker };
