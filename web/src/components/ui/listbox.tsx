"use client";

import { Check, type LucideIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export type ListOption<T extends string = string> = {
  value: T;
  label: string;
  hint?: string;
  icon?: LucideIcon;
  disabled?: boolean;
};

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trimStart();

/** Index activable suivant (en sautant les options désactivées), borné aux extrémités. */
export function nextEnabled(options: ListOption[], from: number, dir: 1 | -1): number {
  let i = from;
  for (let n = 0; n < options.length; n++) {
    i += dir;
    if (i < 0 || i >= options.length) return from;
    if (!options[i]?.disabled) return i;
  }
  return from;
}

export function firstEnabled(options: ListOption[], dir: 1 | -1 = 1): number {
  const start = dir === 1 ? -1 : options.length;
  const i = nextEnabled(options, start, dir);
  return i === start ? -1 : i;
}

/**
 * Frappe au clavier (comme le `<select>` natif) : les lettres tapées en moins de 500 ms forment un préfixe ; la même
 * lettre répétée passe à l'option suivante qui commence par elle. Accents et casse ignorés.
 */
export function useTypeahead(options: ListOption[]) {
  const buffer = React.useRef("");
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  return React.useCallback(
    (char: string, from: number): number => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => (buffer.current = ""), 500);
      buffer.current += fold(char);
      const q = buffer.current;
      const repeated = q.length > 1 && [...q].every((c) => c === q[0]);
      const needle = repeated ? q[0]! : q;
      const n = options.length;
      const start = repeated || q.length === 1 ? from + 1 : Math.max(from, 0);
      for (let k = 0; k < n; k++) {
        const i = (start + k) % n;
        const o = options[i];
        if (o && !o.disabled && fold(o.label).startsWith(needle)) return i;
      }
      return from;
    },
    [options],
  );
}

/** Est-ce une touche « caractère imprimable » (frappe pour sauter à une option) ? */
export const isTypeaheadKey = (e: React.KeyboardEvent) =>
  e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey;

/**
 * Navigation clavier d'une liste ouverte (motif APG « listbox ») : ↑ ↓, Début / Fin, Page ↑ / ↓ (10), lettres.
 * Renvoie l'index actif suivant, ou null si la touche ne concerne pas la navigation.
 */
export function listboxNavigate(
  e: React.KeyboardEvent,
  options: ListOption[],
  active: number,
  typeahead: (char: string, from: number) => number,
): number | null {
  switch (e.key) {
    case "ArrowDown":
      return active < 0 ? firstEnabled(options) : nextEnabled(options, active, 1);
    case "ArrowUp":
      return active < 0 ? firstEnabled(options, -1) : nextEnabled(options, active, -1);
    case "Home":
      return firstEnabled(options);
    case "End":
      return firstEnabled(options, -1);
    case "PageDown": {
      let i = active;
      for (let k = 0; k < 10; k++) i = nextEnabled(options, i, 1);
      return i;
    }
    case "PageUp": {
      let i = active;
      for (let k = 0; k < 10; k++) i = nextEnabled(options, i, -1);
      return i;
    }
    default:
      return isTypeaheadKey(e) ? typeahead(e.key, active) : null;
  }
}

export const optionId = (listId: string, i: number) => `${listId}-opt-${i}`;

/**
 * Liste d'options commune (Select, puis Combobox / MultiSelect) : `role="listbox"`, options `role="option"`, option
 * active désignée par `aria-activedescendant` (posé par le contrôle qui garde le focus) et ramenée dans la vue.
 * `touch` : options de 48 px (feuille du bas).
 */
function Listbox<T extends string>({
  id,
  options,
  selected,
  active,
  onActiveChange,
  onSelect,
  touch = false,
  labelledBy,
  label,
  focusable = false,
  onKeyDown,
  className,
}: {
  id: string;
  options: ListOption<T>[];
  selected: T | null | undefined;
  active: number;
  onActiveChange: (i: number) => void;
  onSelect: (value: T) => void;
  touch?: boolean;
  labelledBy?: string;
  label?: string;
  /** La liste prend le focus elle-même (feuille du bas) au lieu du déclencheur. */
  focusable?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLUListElement>;
  className?: string;
}) {
  React.useEffect(() => {
    if (active < 0) return;
    document.getElementById(optionId(id, active))?.scrollIntoView?.({ block: "nearest" });
  }, [active, id]);
  return (
    <ul
      id={id}
      role="listbox"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      tabIndex={focusable ? 0 : -1}
      aria-activedescendant={focusable && active >= 0 ? optionId(id, active) : undefined}
      onKeyDown={onKeyDown}
      className={cn("flex flex-col gap-0.5 p-1 outline-none", className)}
    >
      {options.length === 0 ? (
        <li role="presentation" className="px-3 py-2 text-small text-fg-muted">
          Aucune option
        </li>
      ) : null}
      {options.map((o, i) => {
        const isSelected = o.value === selected;
        const Icon = o.icon;
        return (
          <li
            key={`${o.value}-${i}`}
            id={optionId(id, i)}
            role="option"
            aria-selected={isSelected}
            aria-disabled={o.disabled || undefined}
            data-active={i === active || undefined}
            // Le focus reste sur le déclencheur (desktop) : pas de vol de focus au clic.
            onMouseDown={(e) => e.preventDefault()}
            onPointerMove={() => !o.disabled && i !== active && onActiveChange(i)}
            onClick={() => !o.disabled && onSelect(o.value)}
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-control px-3 text-body text-fg select-none",
              touch ? "min-h-12 py-3" : "min-h-9 py-2",
              "data-[active]:bg-surface-2",
              isSelected && "font-medium",
              o.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {Icon ? <Icon className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden /> : null}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="break-words">{o.label}</span>
              {o.hint ? <span className="text-small text-fg-muted">{o.hint}</span> : null}
            </span>
            <Check
              aria-hidden
              className={cn("mt-0.5 size-4 shrink-0 text-accent", !isSelected && "invisible")}
            />
          </li>
        );
      })}
    </ul>
  );
}

export { Listbox };
