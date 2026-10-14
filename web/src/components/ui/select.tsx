"use client";

import { ChevronDown } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

import { useControllableValue, useFormBridge } from "./form-bridge";
import {
  firstEnabled,
  isTypeaheadKey,
  Listbox,
  listboxNavigate,
  optionId,
  useTypeahead,
  type ListOption,
} from "./listbox";
import { PickerSurface, usePickerSheet } from "./popover";

export type SelectOption<T extends string = string> = ListOption<T>;

type SelectProps<T extends string> = {
  name?: string;
  options: SelectOption<T>[];
  value?: T | "";
  defaultValue?: T | "";
  onValueChange?: (value: T | "") => void;
  placeholder?: string;
  /** Ajoute en tête une option vide (libellé = `placeholder`) pour revenir à « aucun choix » (« Tous »). */
  clearable?: boolean;
  disabled?: boolean;
  /** Titre de la feuille du bas (mobile) ; à défaut, le texte du `<label for>` du champ. */
  label?: string;
  className?: string;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean;
  "aria-label"?: string;
  "data-testid"?: string;
};

/** Texte du libellé relié au contrôle (`<label for=id>` posé par `Field`, ou `<label>` englobant). */
export function labelText(el: HTMLElement | null): string {
  if (!el) return "";
  const byFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
  const wrapping = el.closest("label");
  const source = byFor ?? wrapping;
  let text = el.getAttribute("aria-label") ?? "";
  if (source) {
    // `<label>` englobant : son texte contient aussi le libellé choisi du déclencheur, à retirer.
    const clone = source.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll('[data-slot="select"], input, select, textarea')
      .forEach((n) => n.remove());
    text = clone.textContent ?? text;
  }
  return text
    .replace(/\s+/g, " ")
    .replace(/\s*\*\s*$/, "")
    .trim();
}

/**
 * Liste déroulante à sélection simple (motif APG « Select-only combobox ») : remplace le `<select>` natif dont la liste
 * suivait le thème du système et coupait les libellés. Desktop : Popover ancré (largeur du déclencheur, 12 rem au moins,
 * 18 rem de haut au plus). Mobile / tactile : même liste en feuille du bas (options de 48 px). Le libellé choisi passe à
 * la ligne dans le déclencheur au lieu d'être coupé. Valeur envoyée par un champ caché `name` (pont formulaire).
 */
function Select<T extends string>({
  name,
  options,
  value,
  defaultValue = "",
  onValueChange,
  placeholder = "Choisir…",
  clearable = false,
  disabled = false,
  label,
  className,
  id: idProp,
  ...aria
}: SelectProps<T>) {
  const autoId = React.useId();
  const id = idProp ?? autoId;
  const listId = `${id}-liste`;
  const [current, setCurrent] = useControllableValue<T | "">(value, defaultValue, onValueChange);
  const bridge = useFormBridge(current);
  const sheet = usePickerSheet();
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [title, setTitle] = React.useState(label ?? "");
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const list = React.useMemo<SelectOption<T | "">[]>(
    () => (clearable ? [{ value: "" as const, label: placeholder }, ...options] : options),
    [clearable, options, placeholder],
  );
  const typeahead = useTypeahead(list);
  const selectedIndex = list.findIndex((o) => o.value === current);
  const selected = selectedIndex >= 0 ? list[selectedIndex] : undefined;
  const showPlaceholder = !selected || (clearable && current === "");

  const openList = (at?: number) => {
    if (disabled) return;
    setTitle(label ?? labelText(triggerRef.current));
    setActive(at ?? (selectedIndex >= 0 ? selectedIndex : firstEnabled(list)));
    setOpen(true);
  };
  const choose = (v: T | "") => {
    if (v !== current) {
      bridge.markUserChange();
      setCurrent(v);
    }
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        openList(e.key === "ArrowUp" && selectedIndex < 0 ? firstEnabled(list, -1) : undefined);
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        openList(firstEnabled(list, e.key === "Home" ? 1 : -1));
      } else if (isTypeaheadKey(e)) {
        e.preventDefault();
        openList(typeahead(e.key, selectedIndex));
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "Enter" || e.key === " " || (e.key === "ArrowUp" && e.altKey)) {
      e.preventDefault();
      const o = list[active];
      if (o && !o.disabled) choose(o.value);
      else setOpen(false);
      return;
    }
    if (e.key === "Tab") {
      const o = list[active];
      if (o && !o.disabled && o.value !== current) {
        bridge.markUserChange();
        setCurrent(o.value);
      }
      setOpen(false);
      return;
    }
    const next = listboxNavigate(e, list, active, typeahead);
    if (next !== null) {
      e.preventDefault();
      setActive(next);
    }
  };

  const Icon = selected && !showPlaceholder ? selected.icon : undefined;

  return (
    <>
      <PickerSurface
        open={open}
        onOpenChange={(o) => (o ? openList() : setOpen(false))}
        sheet={sheet}
        title={title || placeholder}
        triggerRef={triggerRef}
        className={
          sheet
            ? undefined
            : "max-h-72 w-[var(--radix-popover-trigger-width)] min-w-48 overflow-y-auto"
        }
        onOpenAutoFocus={(e) => {
          // Desktop : le focus reste sur le déclencheur (aria-activedescendant). Feuille : sur la liste.
          e.preventDefault();
          if (sheet) document.getElementById(listId)?.focus();
        }}
        anchor={
          <button
            ref={triggerRef}
            type="button"
            id={id}
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={
              open && !sheet && active >= 0 ? optionId(listId, active) : undefined
            }
            disabled={disabled}
            data-slot="select"
            data-testid={aria["data-testid"]}
            aria-describedby={aria["aria-describedby"]}
            aria-invalid={aria["aria-invalid"]}
            aria-required={aria["aria-required"]}
            aria-label={aria["aria-label"]}
            onClick={() => (open ? setOpen(false) : openList())}
            onKeyDown={onKeyDown}
            className={cn(
              "flex min-h-control w-full min-w-0 cursor-pointer items-center gap-2 rounded-control border border-border-strong bg-surface px-3 py-1.5 text-left text-body text-fg transition-colors duration-150 outline-none hover:border-fg-muted focus-visible:border-accent focus-visible:outline-1 focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:focus-visible:outline-danger pointer-coarse:text-body-lg",
              open && "border-accent",
              className,
            )}
          >
            {Icon ? <Icon className="size-4 shrink-0 text-fg-muted" aria-hidden /> : null}
            <span
              className={cn(
                "min-w-0 flex-1 break-words whitespace-normal",
                showPlaceholder && "text-fg-subtle",
              )}
            >
              {selected && !showPlaceholder ? selected.label : placeholder}
            </span>
            <ChevronDown
              aria-hidden
              className={cn(
                "size-4 shrink-0 text-fg-muted transition-transform duration-150",
                open && "rotate-180",
              )}
            />
          </button>
        }
      >
        <Listbox
          id={listId}
          options={list}
          selected={current}
          active={active}
          onActiveChange={setActive}
          onSelect={choose}
          touch={sheet}
          labelledBy={id}
          focusable={sheet}
          onKeyDown={sheet ? onKeyDown : undefined}
        />
      </PickerSurface>
      {name ? <input ref={bridge.ref} type="hidden" name={name} value={current} readOnly /> : null}
    </>
  );
}

export { Select };
