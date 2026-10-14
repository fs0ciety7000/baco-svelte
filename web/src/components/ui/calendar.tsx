"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";

import {
  addDays,
  addMonths,
  clampDate,
  dayLabel,
  endOfWeek,
  holidayName,
  isIsoDate,
  monthGrid,
  monthLabel,
  parseIso,
  startOfWeek,
  todayIso,
  WEEKDAYS,
} from "@/lib/dates/calendar";
import { cn } from "@/lib/utils";

/**
 * Grille de dates (motif APG « Date picker dialog ») : `role="grid"`, semaine du lundi, libellés `Intl` fr-BE, jours
 * fériés belges marqués. Clavier : ← → (jour), ↑ ↓ (semaine), Page ↑ / ↓ (mois, + Maj : année), Début / Fin (lundi /
 * dimanche), Entrée ou Espace choisit. Focus « itinérant » : seul le jour actif est dans l'ordre de tabulation.
 */
function Calendar({
  value,
  min,
  max,
  onSelect,
  range,
  autoFocus = false,
  touch = false,
  className,
}: {
  value?: string;
  min?: string;
  max?: string;
  onSelect: (iso: string) => void;
  /** Période à surligner (DateRangePicker). */
  range?: { from?: string; to?: string };
  autoFocus?: boolean;
  touch?: boolean;
  className?: string;
}) {
  const today = todayIso();
  const [focused, setFocused] = React.useState(() =>
    clampDate(isIsoDate(value) ? value! : today, min, max),
  );
  const gridRef = React.useRef<HTMLTableElement>(null);
  const moved = React.useRef(autoFocus);
  const labelId = React.useId();
  const p = parseIso(focused)!;
  const weeks = monthGrid(p.y, p.m);

  React.useEffect(() => {
    if (!moved.current) return;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`button[data-date="${focused}"]`)
      ?.focus({ preventScroll: true });
  }, [focused]);

  const outOfRange = (iso: string) => (!!min && iso < min) || (!!max && iso > max);
  const move = (iso: string) => {
    moved.current = true;
    setFocused(clampDate(iso, min, max));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    let next: string | null = null;
    switch (e.key) {
      case "ArrowLeft":
        next = addDays(focused, -1);
        break;
      case "ArrowRight":
        next = addDays(focused, 1);
        break;
      case "ArrowUp":
        next = addDays(focused, -7);
        break;
      case "ArrowDown":
        next = addDays(focused, 7);
        break;
      case "PageUp":
        next = addMonths(focused, e.shiftKey ? -12 : -1);
        break;
      case "PageDown":
        next = addMonths(focused, e.shiftKey ? 12 : 1);
        break;
      case "Home":
        next = startOfWeek(focused);
        break;
      case "End":
        next = endOfWeek(focused);
        break;
    }
    if (next) {
      e.preventDefault();
      move(next);
    }
  };

  const shiftMonth = (n: number) => {
    // Les boutons « mois précédent / suivant » ne volent pas le focus à la grille au clavier.
    setFocused((f) => clampDate(addMonths(f, n), min, max));
  };

  return (
    <div className={cn("flex flex-col gap-2 p-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="Mois précédent"
          className="grid size-control cursor-pointer place-items-center rounded-control text-fg-muted hover:bg-surface-2 hover:text-fg"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <p id={labelId} aria-live="polite" className="text-body font-semibold">
          {monthLabel(p.y, p.m)}
        </p>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Mois suivant"
          className="grid size-control cursor-pointer place-items-center rounded-control text-fg-muted hover:bg-surface-2 hover:text-fg"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
      <table
        ref={gridRef}
        role="grid"
        aria-labelledby={labelId}
        onKeyDown={onKeyDown}
        className="w-full border-collapse"
      >
        <thead>
          <tr>
            {WEEKDAYS.map((w) => (
              <th
                key={w.long}
                scope="col"
                abbr={w.long}
                className="pb-1 text-center text-small font-normal text-fg-muted"
              >
                {w.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((iso) => {
                const d = parseIso(iso)!;
                const other = d.m !== p.m;
                const holiday = holidayName(iso);
                const selected = iso === value;
                const disabled = outOfRange(iso);
                const inRange =
                  !!range?.from && !!range?.to && iso >= range.from && iso <= range.to;
                const label = [
                  dayLabel(iso),
                  holiday ? `férié : ${holiday}` : "",
                  iso === today ? "aujourd'hui" : "",
                ]
                  .filter(Boolean)
                  .join(", ");
                return (
                  <td key={iso} aria-selected={selected} className="p-0.5 text-center">
                    <button
                      type="button"
                      data-date={iso}
                      tabIndex={iso === focused ? 0 : -1}
                      disabled={disabled}
                      aria-label={label}
                      title={holiday}
                      onClick={() => onSelect(iso)}
                      onFocus={() => iso !== focused && setFocused(iso)}
                      className={cn(
                        "relative mx-auto grid cursor-pointer place-items-center rounded-control text-body tabular outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-35",
                        touch ? "size-11" : "size-9 pointer-coarse:size-11",
                        other && "text-fg-subtle",
                        holiday && !selected && "font-semibold text-danger",
                        inRange && !selected && "bg-accent-soft",
                        iso === today && !selected && "ring-1 ring-border-strong ring-inset",
                        selected && "bg-accent text-accent-fg hover:bg-accent",
                      )}
                    >
                      {d.d}
                      {holiday ? (
                        <span
                          aria-hidden
                          className={cn(
                            "absolute bottom-1 size-1 rounded-full",
                            selected ? "bg-accent-fg" : "bg-danger",
                          )}
                        />
                      ) : null}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
        <button
          type="button"
          disabled={outOfRange(today)}
          onClick={() => onSelect(today)}
          className="min-h-control-sm cursor-pointer rounded-control px-2 text-small font-medium text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Aujourd&apos;hui
        </button>
        <span className="flex items-center gap-1.5 text-small text-fg-muted">
          <span aria-hidden className="size-1.5 rounded-full bg-danger" /> Jour férié
        </span>
      </div>
    </div>
  );
}

export { Calendar };
