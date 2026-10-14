"use client";

import * as React from "react";

/**
 * Pont formulaire des contrôles personnalisés : la valeur part dans un `<input type="hidden" name>` (formulaires GET,
 * `next/form`, Server Actions) et un événement `change` natif qui remonte est émis après chaque choix de l'agent,
 * jamais au montage ni quand le parent change la valeur : `FormAutoSubmit` soumet donc les filtres sans changement.
 */
export function useFormBridge<T extends string>(value: T) {
  const ref = React.useRef<HTMLInputElement>(null);
  const pending = React.useRef(false);
  React.useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    ref.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [value]);
  return {
    ref,
    /** À appeler juste avant un changement voulu par l'agent. */
    markUserChange() {
      pending.current = true;
    },
  };
}

/** Valeur contrôlée (`value` + `onValueChange`) ou non (`defaultValue`), comme les champs natifs. */
export function useControllableValue<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (v: T) => void,
): [T, (v: T) => void] {
  const [inner, setInner] = React.useState<T>(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : inner;
  const set = React.useCallback(
    (v: T) => {
      if (!controlled) setInner(v);
      onChange?.(v);
    },
    [controlled, onChange],
  );
  return [current, set];
}

/**
 * Le champ texte visible d'un contrôle (date, heure) n'a pas de `name` et son `change` natif (à la sortie du champ)
 * ne doit pas remonter : seule la valeur ISO validée, portée par le champ caché, déclenche `FormAutoSubmit`.
 */
export function useStopNativeChange(ref: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener("change", stop);
    return () => el.removeEventListener("change", stop);
  }, [ref]);
}
