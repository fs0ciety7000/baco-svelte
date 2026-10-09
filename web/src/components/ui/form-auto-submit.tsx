"use client";

import { useEffect, useRef } from "react";

/**
 * Filtres « automatiques » : placé dans un <Form> de next/form (ou un <form method="get">), soumet le formulaire dès qu'un champ change
 * (liste, date ; la recherche texte à la validation ou à la sortie du champ). Le formulaire reste utilisable sans JS
 * (bouton Filtrer conservé). Retour utilisateur du 8 oct. 2026 : « il faudrait que ça filtre automatiquement ».
 */
export function FormAutoSubmit() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      // Une date en cours de saisie au clavier (valeur partielle) ne déclenche pas la recherche.
      if (t?.type === "date" && t.value && !t.checkValidity()) return;
      form.requestSubmit();
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, []);
  return <span ref={ref} hidden />;
}
