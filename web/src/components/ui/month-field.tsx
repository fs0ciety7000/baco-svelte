"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";

import {
  addMonthsYm,
  formatMonthFr,
  isMonth,
  monthShort,
  pad2,
  parseMonthText,
  todayIso,
} from "@/lib/dates/calendar";
import { cn } from "@/lib/utils";

import { useControllableValue, useFormBridge, useStopNativeChange } from "./form-bridge";
import { fieldBase } from "./input";
import { PickerSurface, usePickerSheet } from "./popover";
import { labelText } from "./select";

/**
 * Mois `mm/aaaa` (valeur `AAAA-MM`) : saisie « 102026 », « 10/26 », ↑ ↓ ± 1 mois, ou grille des 12 mois (← → ↑ ↓,
 * Page ↑ / ↓ = année). Même socle que DateField (pont formulaire, feuille du bas en mobile).
 */
function MonthField({
  name,
  value,
  defaultValue = "",
  onValueChange,
  placeholder = "mm/aaaa",
  disabled = false,
  label,
  className,
  id: idProp,
  ...aria
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (ym: string) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  className?: string;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-label"?: string;
  "data-testid"?: string;
}) {
  const autoId = React.useId();
  const id = idProp ?? autoId;
  const [current, setCurrent] = useControllableValue(value, defaultValue, onValueChange);
  const bridge = useFormBridge(current);
  const sheet = usePickerSheet();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  useStopNativeChange(inputRef);
  const [text, setText] = React.useState(() => formatMonthFr(current));
  const [synced, setSynced] = React.useState(current);
  if (synced !== current) {
    setSynced(current);
    if (parseMonthText(text) !== current) setText(formatMonthFr(current));
  }
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState(label ?? "");
  const thisMonth = todayIso().slice(0, 7);
  const [focused, setFocused] = React.useState(isMonth(current) ? current : thisMonth);
  const gridRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() =>
      gridRef.current
        ?.querySelector<HTMLButtonElement>(`button[data-month="${focused}"]`)
        ?.focus({ preventScroll: true }),
    );
  }, [focused, open]);

  const commit = (v: string) => {
    setText(formatMonthFr(v));
    if (v !== current) {
      bridge.markUserChange();
      setCurrent(v);
    }
    return v;
  };
  const settle = () => {
    if (!text.trim()) return commit("");
    const m = parseMonthText(text);
    if (m) return commit(m);
    setText(formatMonthFr(current));
    return current;
  };
  const openGrid = () => {
    if (disabled) return;
    setTitle(label ?? (labelText(inputRef.current) || "Choisir un mois"));
    setFocused(isMonth(current) ? current : thisMonth);
    setOpen(true);
  };
  const select = (ym: string) => {
    commit(ym);
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  };

  const year = Number(focused.slice(0, 4));
  const gridKeys = (e: React.KeyboardEvent) => {
    const delta: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -3,
      ArrowDown: 3,
      PageUp: -12,
      PageDown: 12,
    };
    const d = delta[e.key];
    if (d) {
      e.preventDefault();
      setFocused((f) => addMonthsYm(f, d));
    }
  };

  return (
    <>
      <PickerSurface
        open={open}
        onOpenChange={(o) => (o ? openGrid() : setOpen(false))}
        sheet={sheet}
        modal
        title={title}
        triggerRef={buttonRef}
        role={sheet ? undefined : "dialog"}
        aria-label={sheet ? undefined : "Choisir un mois"}
        className={sheet ? undefined : "w-72"}
        onOpenAutoFocus={(e) => e.preventDefault()}
        anchor={
          <div className={cn("relative min-w-0", className)}>
            <input
              ref={inputRef}
              id={id}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={7}
              placeholder={placeholder}
              value={text}
              disabled={disabled}
              aria-describedby={aria["aria-describedby"]}
              aria-invalid={aria["aria-invalid"]}
              aria-label={aria["aria-label"]}
              data-testid={aria["data-testid"]}
              data-slot="month-field"
              onChange={(e) => {
                const inputType = (e.nativeEvent as InputEvent).inputType ?? "insertText";
                let next = e.target.value;
                if (!inputType.startsWith("delete") && /^\d{6}$/.test(next))
                  next = `${next.slice(0, 2)}/${next.slice(2)}`;
                setText(next);
                if (!next.trim()) commit("");
                else if (/^\d{2}\/\d{4}$/.test(next)) {
                  const m = parseMonthText(next);
                  if (m && m !== current) {
                    bridge.markUserChange();
                    setCurrent(m);
                  }
                }
              }}
              onBlur={settle}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && e.altKey) {
                  e.preventDefault();
                  openGrid();
                } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                  e.preventDefault();
                  const base = parseMonthText(text) ?? (isMonth(current) ? current : "");
                  commit(base ? addMonthsYm(base, e.key === "ArrowUp" ? 1 : -1) : thisMonth);
                } else if (e.key === "Enter") {
                  const before = current;
                  if (settle() !== before) e.preventDefault();
                }
              }}
              className={cn(fieldBase, "h-field pr-11 tabular")}
            />
            <button
              ref={buttonRef}
              type="button"
              aria-label="Choisir un mois"
              aria-haspopup="dialog"
              aria-expanded={open}
              disabled={disabled}
              onClick={() => (open ? setOpen(false) : openGrid())}
              className="absolute top-1/2 right-1 grid size-control-sm -translate-y-1/2 cursor-pointer place-items-center rounded-control text-fg-muted hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CalendarDays className="size-4" aria-hidden />
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Année précédente"
              onClick={() => setFocused((f) => addMonthsYm(f, -12))}
              className="grid size-control cursor-pointer place-items-center rounded-control text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <p aria-live="polite" className="text-body font-semibold tabular">
              {year}
            </p>
            <button
              type="button"
              aria-label="Année suivante"
              onClick={() => setFocused((f) => addMonthsYm(f, 12))}
              className="grid size-control cursor-pointer place-items-center rounded-control text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <div ref={gridRef} role="group" onKeyDown={gridKeys} className="grid grid-cols-3 gap-1">
            {Array.from({ length: 12 }, (_, i) => {
              const ym = `${year}-${pad2(i + 1)}`;
              const selected = ym === current;
              return (
                <button
                  key={ym}
                  type="button"
                  data-month={ym}
                  tabIndex={ym === focused ? 0 : -1}
                  aria-pressed={selected}
                  onClick={() => select(ym)}
                  className={cn(
                    "min-h-control cursor-pointer rounded-control text-body capitalize hover:bg-surface-2",
                    ym === thisMonth && !selected && "ring-1 ring-border-strong ring-inset",
                    selected && "bg-accent text-accent-fg hover:bg-accent",
                  )}
                >
                  {monthShort(i + 1)}
                </button>
              );
            })}
          </div>
        </div>
      </PickerSurface>
      {name ? <input ref={bridge.ref} type="hidden" name={name} value={current} readOnly /> : null}
    </>
  );
}

export { MonthField };
