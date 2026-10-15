"use client";

import { ChevronDown, Search } from "lucide-react";
import * as React from "react";

import { foldStation } from "@/lib/stations/search";
import { cn, pl } from "@/lib/utils";

import { useControllableValue, useFormBridge, useStopNativeChange } from "./form-bridge";
import { fieldBase, triggerBase } from "./input";
import { firstEnabled, Listbox, nextEnabled, optionId, type ListOption } from "./listbox";
import { PickerSurface, usePickerSheet } from "./popover";
import { labelText } from "./select";

export type ComboboxOption<T extends string = string> = ListOption<T>;

/** Filtre par défaut : chaque mot tapé se retrouve dans le libellé ou l'aide (accents, casse, ponctuation ignorés). */
export function comboboxMatch(o: ListOption, query: string): boolean {
  const words = foldStation(query).split(" ").filter(Boolean);
  if (!words.length) return true;
  const hay = foldStation(`${o.label} ${o.hint ?? ""}`);
  return words.every((w) => hay.includes(w));
}

/** Options qui passent le filtre ; celles dont le libellé commence par la saisie d'abord (ordre gardé sinon). */
export function filterOptions<T extends string>(
  options: ListOption<T>[],
  query: string,
  filter: (o: ListOption<T>, q: string) => boolean = comboboxMatch,
  max = 100,
): ListOption<T>[] {
  const q = foldStation(query);
  if (!q) return options.slice(0, max);
  const head: ListOption<T>[] = [];
  const rest: ListOption<T>[] = [];
  for (const o of options) {
    if (!filter(o, query)) continue;
    (foldStation(o.label).startsWith(q) ? head : rest).push(o);
  }
  return [...head, ...rest].slice(0, max);
}

const sameText = (a: string, b: string) => foldStation(a) === foldStation(b);

type Loader<T extends string> = (query: string) => ListOption<T>[] | Promise<ListOption<T>[]>;

export type ComboboxProps<T extends string> = {
  /** Champ caché envoyé avec le formulaire (valeur de l'option, ou texte libre avec `allowFree`). */
  name?: string;
  options?: ListOption<T>[];
  /**
   * Recherche personnalisée (remplace `options` + `filter`) : synchrone (référentiel en mémoire) ou asynchrone (Server
   * Action, `aria-busy` pendant le chargement, réponses périmées ignorées).
   */
  loadOptions?: Loader<T>;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  filter?: (o: ListOption<T>, query: string) => boolean;
  /**
   * Saisie libre : la valeur EST le texte (mis à jour à chaque frappe) ; choisir une option le remplace. Sinon la valeur
   * est celle d'une option, le texte tapé ne sert qu'à chercher (rendu au libellé choisi à la sortie du champ).
   */
  allowFree?: boolean;
  /** Saisie libre : correction appliquée à la sortie du champ (nom exact du référentiel…). */
  normalize?: (text: string) => string;
  /** Option « Ajouter « … » » quand la saisie ne correspond à aucune option (saisie libre, ou `onCreate`). */
  createLabel?: (query: string) => string;
  onCreate?: (query: string) => void;
  emptyText?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Ouvre la liste dès l'arrivée dans le champ (sinon à la frappe ou ↓). */
  openOnFocus?: boolean;
  /** Nombre d'options affichées au plus (défaut 100). */
  max?: number;
  /** Titre de la feuille du bas (mobile) ; à défaut, le texte du `<label for>`. */
  label?: string;
  /** Libellé de la liste pour les lecteurs d'écran (« Gares proposées »). */
  listLabel?: string;
  className?: string;
  id?: string;
  maxLength?: number;
  autoFocus?: boolean;
  required?: boolean;
  onBlur?: () => void;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean;
  "aria-label"?: string;
  "data-testid"?: string;
};

/**
 * Recherche dans une liste (refonte R2, 14 oct. 2026 ; motif APG « Combobox with listbox popup, autocomplete list ») :
 * la frappe filtre (accents et casse ignorés), ↓ ↑ déplacent, Entrée choisit l'option active (la première après une
 * frappe), Alt+↓ ouvre sans filtrer, Échap ferme puis vide, Tab sort. Champ texte `role="combobox"` + `Listbox` dans un
 * Popover ancré (desktop). Mobile / tactile, liste fermée (sans saisie libre) : le champ devient un bouton qui ouvre une
 * feuille du bas avec la recherche en haut (16 px). Avec saisie libre, la liste reste sous le champ (le clavier du
 * téléphone est déjà ouvert). `aria-live` annonce « N résultats ».
 */
function Combobox<T extends string>(props: ComboboxProps<T>) {
  const {
    name,
    options = [],
    loadOptions,
    value,
    defaultValue = "",
    onValueChange,
    filter,
    allowFree = false,
    normalize,
    createLabel,
    onCreate,
    emptyText = "Aucun résultat",
    placeholder,
    disabled = false,
    openOnFocus = false,
    max = 100,
    label,
    listLabel,
    className,
    id: idProp,
    maxLength,
    autoFocus,
    required,
    onBlur,
  } = props;
  const autoId = React.useId();
  const id = idProp ?? autoId;
  const listId = `${id}-liste`;
  const [current, setCurrent] = useControllableValue<string>(value, defaultValue, onValueChange);
  const bridge = useFormBridge(current);
  const sheetMode = usePickerSheet() && !allowFree;
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  // Texte tapé pour chercher (liste fermée) ; null = afficher le libellé de l'option choisie.
  const [query, setQuery] = React.useState<string | null>(null);
  // Alt+↓ : liste complète, sans filtre.
  const [unfiltered, setUnfiltered] = React.useState(false);
  const [title, setTitle] = React.useState(label ?? "");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  // Les champs visibles n'ont pas de `name` : leur `change` natif ne doit pas soumettre un filtre GET.
  useStopNativeChange(inputRef);
  useStopNativeChange(searchRef);

  const selectedOption = React.useMemo(
    () => (allowFree ? undefined : options.find((o) => o.value === current)),
    [allowFree, options, current],
  );
  // Texte du champ : saisie libre = valeur ; sinon recherche en cours ou libellé choisi.
  const text = allowFree ? current : (query ?? selectedOption?.label ?? "");
  const search = allowFree ? (unfiltered ? "" : current) : unfiltered ? "" : (query ?? "");

  // Options : synchrones (filtrées ici) ou chargées.
  const [loaded, setLoaded] = React.useState<ListOption<T>[]>([]);
  const [busy, setBusy] = React.useState(false);
  const seq = React.useRef(0);
  const isAsync = React.useRef(false);
  React.useEffect(() => {
    if (!loadOptions || !open) return;
    const n = ++seq.current;
    const run = () => {
      const r = loadOptions(search);
      if (r instanceof Promise) {
        isAsync.current = true;
        setBusy(true);
        r.then(
          (list) => n === seq.current && (setLoaded(list), setBusy(false)),
          () => n === seq.current && (setLoaded([]), setBusy(false)),
        );
      } else setLoaded(r);
    };
    if (!isAsync.current) {
      run();
      return;
    }
    const t = setTimeout(run, 200);
    return () => clearTimeout(t);
  }, [loadOptions, search, open]);

  const filtered = React.useMemo<ListOption<T>[]>(
    () => (loadOptions ? loaded.slice(0, max) : filterOptions(options, search, filter, max)),
    [loadOptions, loaded, options, search, filter, max],
  );
  const q = (allowFree ? current : (query ?? "")).trim();
  const canCreate =
    !!q && (allowFree || onCreate) && !!createLabel && !filtered.some((o) => sameText(o.label, q));
  const list = React.useMemo<ListOption<T>[]>(
    () => (canCreate ? [...filtered, { value: q as T, label: createLabel!(q) }] : filtered),
    [canCreate, q, createLabel, filtered],
  );
  // Saisie libre sans proposition : rien à montrer (pas de « Aucun résultat » sous un champ libre).
  const showList = open && (list.length > 0 || busy || !allowFree);

  // Option active : la première après une frappe (sélection automatique), sinon celle choisie.
  React.useEffect(() => {
    if (!open) return;
    if (search) setActive(firstEnabled(list));
    else {
      const i = list.findIndex((o) => o.value === current);
      setActive(i >= 0 ? i : allowFree ? -1 : firstEnabled(list));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, list]);

  const openList = (all = false) => {
    if (disabled) return;
    setTitle(label ?? labelText(inputRef.current ?? triggerRef.current));
    setUnfiltered(all);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setUnfiltered(false);
  };
  // Saisie libre : la valeur suit la frappe sans `change` ; il part à la validation (Entrée, sortie, option choisie),
  // une seule fois par valeur (filtre GET d'une gare tapée : `FormAutoSubmit`).
  const commitFree = (v: string) => {
    if (v !== current) {
      bridge.markUserChange();
      setCurrent(v);
    } else dispatchNow();
  };
  const hiddenRef = bridge.ref;
  const lastSent = React.useRef(current);
  const dispatchNow = () => {
    if (lastSent.current === current) return;
    lastSent.current = current;
    hiddenRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
  };
  React.useEffect(() => {
    // Toute valeur émise par le pont (choix d'une option) compte comme envoyée.
    const el = hiddenRef.current;
    if (!el) return;
    const mark = () => (lastSent.current = el.value);
    el.addEventListener("change", mark);
    return () => el.removeEventListener("change", mark);
  }, [hiddenRef]);

  const choose = (o: ListOption<T> | undefined) => {
    if (!o || o.disabled) return;
    if (canCreate && o === list[list.length - 1] && !allowFree) {
      onCreate?.(q);
      setQuery(null);
      close();
      return;
    }
    if (allowFree) commitFree(o.value);
    else {
      if (o.value !== current) {
        bridge.markUserChange();
        setCurrent(o.value);
      }
      setQuery(null);
    }
    close();
    if (sheetMode) triggerRef.current?.focus({ preventScroll: true });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        openList(e.altKey);
        return;
      }
      if (e.altKey && e.key === "ArrowUp") {
        close();
        return;
      }
      setActive((a) =>
        a < 0
          ? firstEnabled(list, e.key === "ArrowDown" ? 1 : -1)
          : nextEnabled(list, a, e.key === "ArrowDown" ? 1 : -1),
      );
      return;
    }
    if ((e.key === "PageDown" || e.key === "PageUp") && open) {
      e.preventDefault();
      setActive((a) => {
        let i = a;
        for (let k = 0; k < 10; k++) i = nextEnabled(list, i, e.key === "PageDown" ? 1 : -1);
        return i;
      });
      return;
    }
    if (e.key === "Enter") {
      if (showList && active >= 0 && list[active]) {
        e.preventDefault();
        choose(list[active]);
      } else if (allowFree) commitFree(normalize ? normalize(current) : current);
      return;
    }
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        close();
        if (!allowFree) setQuery(null);
      } else if (text) {
        e.preventDefault();
        e.stopPropagation();
        if (allowFree) commitFree("");
        else setQuery("");
      }
      return;
    }
    if (e.key === "Tab" && open) close();
  };

  const onInputBlur = () => {
    // Un clic sur une option garde le focus (mousedown empêché) : le blur vient d'une vraie sortie du champ.
    close();
    if (allowFree) {
      const v = normalize ? normalize(current) : current;
      commitFree(v);
    } else if (query !== null) {
      const t = query.trim();
      const exact = t ? options.find((o) => sameText(o.label, t)) : undefined;
      if (exact) choose(exact);
      else if (!t && current) {
        bridge.markUserChange();
        setCurrent("");
      }
      setQuery(null);
    }
    onBlur?.();
  };

  const announce = showList && !busy ? `${list.length} ${pl(list.length, "résultat")}` : "";
  const ariaInput = {
    "aria-describedby": props["aria-describedby"],
    "aria-invalid": props["aria-invalid"],
    "aria-required": props["aria-required"] ?? required,
    "aria-label": props["aria-label"],
  };

  const listbox = (
    <Listbox
      id={listId}
      options={list}
      selected={allowFree ? undefined : current}
      active={active}
      onActiveChange={setActive}
      onSelect={(v) => choose(list.find((o) => o.value === v))}
      touch={sheetMode}
      label={listLabel ?? (title || placeholder || "Propositions")}
      emptyText={emptyText}
      busy={busy}
    />
  );

  if (sheetMode) {
    return (
      <>
        <PickerSurface
          open={open}
          onOpenChange={(o) => (o ? openList() : (close(), setQuery(null)))}
          sheet
          title={title || placeholder || "Choisir"}
          triggerRef={triggerRef}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            searchRef.current?.focus();
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
              disabled={disabled}
              data-slot="combobox"
              data-testid={props["data-testid"]}
              {...ariaInput}
              onClick={() => (open ? close() : openList())}
              className={cn(triggerBase, "text-body-lg", className)}
            >
              <span
                className={cn(
                  "min-w-0 flex-1 break-words whitespace-normal",
                  !selectedOption && "text-fg-subtle",
                )}
              >
                {selectedOption?.label ?? placeholder ?? "Choisir…"}
              </span>
              <ChevronDown aria-hidden className="size-4 shrink-0 text-fg-muted" />
            </button>
          }
        >
          <div className="sticky top-0 z-10 bg-surface pb-2">
            <span className="relative block">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
              />
              <input
                ref={searchRef}
                type="search"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded
                aria-controls={listId}
                aria-activedescendant={active >= 0 ? optionId(listId, active) : undefined}
                aria-label={`Rechercher : ${title || placeholder || ""}`.trim()}
                autoComplete="off"
                value={query ?? ""}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Rechercher…"
                className={cn(fieldBase, "h-12 pl-9 text-body-lg")}
              />
            </span>
          </div>
          {listbox}
          <span className="sr-only" aria-live="polite">
            {announce}
          </span>
        </PickerSurface>
        {name ? (
          <input ref={bridge.ref} type="hidden" name={name} value={current} readOnly />
        ) : null}
      </>
    );
  }

  return (
    <>
      <PickerSurface
        open={showList}
        onOpenChange={(o) => (o ? openList() : close())}
        sheet={false}
        title={title}
        triggerRef={inputRef}
        className="max-h-72 w-[var(--radix-popover-trigger-width)] min-w-56 overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
        anchor={
          <span className="relative block min-w-0">
            <input
              ref={inputRef}
              id={id}
              type="text"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showList}
              aria-controls={showList ? listId : undefined}
              aria-activedescendant={showList && active >= 0 ? optionId(listId, active) : undefined}
              aria-busy={busy || undefined}
              autoComplete="off"
              autoFocus={autoFocus}
              required={required}
              maxLength={maxLength}
              disabled={disabled}
              placeholder={placeholder}
              data-slot="combobox"
              data-testid={props["data-testid"]}
              {...ariaInput}
              value={text}
              onChange={(e) => {
                setUnfiltered(false);
                if (allowFree) setCurrent(e.target.value);
                else setQuery(e.target.value);
                if (!open) openList();
              }}
              onFocus={() => openOnFocus && openList()}
              onClick={() => !open && openList()}
              onBlur={onInputBlur}
              onKeyDown={onKeyDown}
              className={cn(
                fieldBase,
                "h-field pointer-coarse:text-body-lg",
                !allowFree && "pr-9",
                className,
              )}
            />
            {!allowFree ? (
              <ChevronDown
                aria-hidden
                className={cn(
                  "pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-muted transition-transform duration-150",
                  showList && "rotate-180",
                )}
              />
            ) : null}
          </span>
        }
      >
        {listbox}
      </PickerSurface>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
      {name ? <input ref={bridge.ref} type="hidden" name={name} value={current} readOnly /> : null}
    </>
  );
}

export { Combobox };
