"use client";

import { useEffect, useRef } from "react";

// Après une soumission « en direct », le formulaire est remonté (FilterForm a pour clé les paramètres d'URL) : le champ
// en cours de saisie et la position du curseur sont rendus au nouveau formulaire.
const g = globalThis as { __csmLiveFocus?: { path: string; name: string; pos: number } };

/**
 * Filtres « automatiques » : placé dans un <Form> de next/form (ou un <form method="get">), soumet le formulaire dès qu'un champ change
 * (liste, date ; la recherche texte à la validation ou à la sortie du champ). Le formulaire reste utilisable sans JS
 * (bouton Filtrer conservé). Retour utilisateur du 8 oct. 2026 : « il faudrait que ça filtre automatiquement ».
 * `live` : la recherche texte part aussi pendant la frappe (après 450 ms sans touche), retour du 14 oct. 2026 : une
 * abréviation tapée (« fcr ») ne donnait rien tant qu'on n'appuyait pas sur Entrée.
 */
export function FormAutoSubmit({ live = false }: { live?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const saved = g.__csmLiveFocus;
    if (saved && saved.path === window.location.pathname) {
      g.__csmLiveFocus = undefined;
      const el = form.elements.namedItem(saved.name);
      if (el instanceof HTMLInputElement) {
        el.focus();
        const pos = Math.min(saved.pos, el.value.length);
        el.setSelectionRange(pos, pos);
      }
    }
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      // Une date en cours de saisie au clavier (valeur partielle) ne déclenche pas la recherche.
      if (t?.type === "date" && t.value && !t.checkValidity()) return;
      form.requestSubmit();
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onInput = (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || !["text", "search"].includes(t.type) || !t.name)
        return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        g.__csmLiveFocus = {
          path: window.location.pathname,
          name: t.name,
          pos: t.selectionStart ?? t.value.length,
        };
        form.requestSubmit();
      }, 450);
    };
    form.addEventListener("change", onChange);
    if (live) form.addEventListener("input", onInput);
    return () => {
      clearTimeout(timer);
      form.removeEventListener("change", onChange);
      form.removeEventListener("input", onInput);
    };
  }, [live]);
  return <span ref={ref} hidden />;
}
