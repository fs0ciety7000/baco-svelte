"use client";

import { ChevronDown, Search } from "lucide-react";
import * as React from "react";

import { cn, pl } from "@/lib/utils";

import { filterOptions } from "./combobox";
import { useControllableValue, useMultiFormBridge, useStopNativeChange } from "./form-bridge";
import { fieldBase } from "./input";
import {
  firstEnabled,
  Listbox,
  listboxNavigate,
  optionId,
  useTypeahead,
  type ListOption,
} from "./listbox";
import { PickerSurface, usePickerSheet } from "./popover";
import { labelText } from "./select";

/** Résumé du déclencheur : « Tous », les libellés s'ils tiennent (≤ 2), sinon « 3 statuts ». */
export function multiSummary(
  selected: ListOption[],
  total: number,
  {
    allLabel = "Tous",
    noun = "choix",
    nouns,
  }: { allLabel?: string; noun?: string; nouns?: string },
): string {
  if (!selected.length || (total > 1 && selected.length === total)) return allLabel;
  if (selected.length <= 2) return selected.map((o) => o.label).join(", ");
  return `${selected.length} ${pl(selected.length, noun, nouns)}`;
}

/**
 * Sélection multiple dans une liste (refonte R4, 14 oct. 2026) : cases dans une `Listbox` `aria-multiselectable`,
 * « Tout / Aucun » en tête, recherche facultative (`searchable`). Clavier : Entrée / Espace / ↓ ouvrent ; ↑ ↓ Début Fin
 * et lettres déplacent ; Espace coche ; Entrée ou Échap ferment. Le déclencheur résume (« DSO, DSE », « 3 statuts »).
 * Valeurs en champs cachés répétés (`?statut=a&statut=b`) ; un seul `change` à la fermeture si elles ont changé
 * (filtres GET : la page ne se recharge pas à chaque case). Mobile / tactile : feuille du bas.
 */
function MultiSelect<T extends string>({
  name,
  options,
  values,
  defaultValues = [],
  onValuesChange,
  allLabel = "Tous",
  noun,
  nouns,
  summary,
  searchable = false,
  emptyValue,
  disabled = false,
  label,
  className,
  id: idProp,
  ...aria
}: {
  name?: string;
  options: ListOption<T>[];
  values?: T[];
  defaultValues?: T[];
  onValuesChange?: (values: T[]) => void;
  /** Résumé sans choix (ou tout coché). */
  allLabel?: string;
  /** Nom des valeurs pour le résumé (« 3 statuts ») ; pluriel irrégulier dans `nouns`. */
  noun?: string;
  nouns?: string;
  /** Résumé imposé. */
  summary?: string;
  searchable?: boolean;
  /** Valeur envoyée sans aucun choix (« tous » : lève un filtre par défaut). */
  emptyValue?: string;
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
  const listId = `${id}-liste`;
  const [current, setCurrent] = useControllableValue<T[]>(values, defaultValues, onValuesChange);
  const ordered = options.map((o) => o.value).filter((v) => current.includes(v));
  const bridge = useMultiFormBridge(ordered);
  const sheet = usePickerSheet();
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [query, setQuery] = React.useState("");
  const [title, setTitle] = React.useState(label ?? "");
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const atOpen = React.useRef("");
  useStopNativeChange(searchRef);

  const list = React.useMemo(
    () => (searchable ? filterOptions(options, query) : options),
    [searchable, options, query],
  );
  const typeahead = useTypeahead(list);
  const selected = options.filter((o) => ordered.includes(o.value));
  const text =
    summary ?? multiSummary(selected, options.length, { allLabel, noun: noun ?? "choix", nouns });

  const openList = () => {
    if (disabled) return;
    setTitle(label ?? labelText(triggerRef.current));
    atOpen.current = bridge.key;
    setQuery("");
    setActive(firstEnabled(options));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    // Un seul `change` par ouverture, si les cases ont changé.
    if (atOpen.current !== bridge.key) {
      atOpen.current = bridge.key;
      bridge.dispatch();
    }
  };
  const set = (next: T[]) =>
    setCurrent(options.map((o) => o.value).filter((v) => next.includes(v)));
  const toggle = (v: T) => {
    const o = options.find((x) => x.value === v);
    if (!o || o.disabled) return;
    set(ordered.includes(v) ? ordered.filter((x) => x !== v) : [...ordered, v]);
  };
  const enabled = options.filter((o) => !o.disabled).map((o) => o.value);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "Escape" || e.key === "Enter" || (e.key === "ArrowUp" && e.altKey)) {
      e.preventDefault();
      e.stopPropagation();
      close();
      triggerRef.current?.focus({ preventScroll: true });
      return;
    }
    if (e.key === " " && !(searchable && e.target === searchRef.current)) {
      e.preventDefault();
      const o = list[active];
      if (o) toggle(o.value);
      return;
    }
    if (e.key === "Tab") {
      close();
      return;
    }
    // Dans la recherche, les lettres s'y écrivent ; seules les flèches déplacent.
    if (searchable && e.target === searchRef.current && e.key.length === 1) return;
    const next = listboxNavigate(e, list, active, typeahead);
    if (next !== null) {
      e.preventDefault();
      setActive(next);
    }
  };

  const allNone = (
    <div className="flex items-center gap-1 border-b border-border px-2 py-1">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => set(enabled)}
        className="inline-flex min-h-9 cursor-pointer items-center rounded-control px-2 text-small text-fg-muted hover:bg-surface-2 hover:text-fg pointer-coarse:min-h-11"
      >
        Tout
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => set([])}
        className="inline-flex min-h-9 cursor-pointer items-center rounded-control px-2 text-small text-fg-muted hover:bg-surface-2 hover:text-fg pointer-coarse:min-h-11"
      >
        Aucun
      </button>
      <span className="ml-auto px-2 text-small text-fg-muted tabular">
        {ordered.length}/{options.length}
      </span>
    </div>
  );

  return (
    <>
      <PickerSurface
        open={open}
        onOpenChange={(o) => (o ? openList() : close())}
        sheet={sheet}
        title={title || allLabel}
        triggerRef={triggerRef}
        className={sheet ? undefined : "w-[var(--radix-popover-trigger-width)] min-w-56"}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          if (searchable) searchRef.current?.focus();
          else if (sheet) document.getElementById(listId)?.focus();
        }}
        onKeyDown={sheet || searchable ? onKeyDown : undefined}
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
              open && !sheet && !searchable && active >= 0 ? optionId(listId, active) : undefined
            }
            disabled={disabled}
            data-slot="multi-select"
            data-testid={aria["data-testid"]}
            aria-describedby={aria["aria-describedby"]}
            aria-invalid={aria["aria-invalid"]}
            aria-label={aria["aria-label"]}
            onClick={() => (open ? close() : openList())}
            onKeyDown={onKeyDown}
            className={cn(
              "flex min-h-control w-full min-w-0 cursor-pointer items-center gap-2 rounded-control border border-border-strong bg-surface px-3 py-1.5 text-left text-body text-fg transition-colors duration-150 outline-none hover:border-fg-muted focus-visible:border-accent focus-visible:outline-1 focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger pointer-coarse:text-body-lg",
              open && "border-accent",
              className,
            )}
          >
            <span
              className={cn(
                "min-w-0 flex-1 break-words whitespace-normal",
                !ordered.length && "text-fg-muted",
              )}
            >
              {text}
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
        {searchable ? (
          <div className="p-2 pb-1">
            <span className="relative block">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
              />
              <input
                ref={searchRef}
                type="search"
                aria-label="Rechercher dans la liste"
                aria-controls={listId}
                aria-activedescendant={active >= 0 ? optionId(listId, active) : undefined}
                autoComplete="off"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder="Rechercher…"
                className={cn(fieldBase, "h-control pl-9 pointer-coarse:text-body-lg")}
              />
            </span>
          </div>
        ) : null}
        {allNone}
        <div className={sheet ? undefined : "max-h-72 overflow-y-auto"}>
          <Listbox
            id={listId}
            options={list}
            selected={ordered}
            multiselectable
            active={active}
            onActiveChange={setActive}
            onSelect={toggle}
            touch={sheet}
            labelledBy={id}
            focusable={sheet && !searchable}
            emptyText="Aucun résultat"
          />
        </div>
      </PickerSurface>
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
    </>
  );
}

export { MultiSelect };
