"use client";

import Form from "next/form";
import { useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";

/**
 * Formulaire de filtres (`next/form`, navigation côté client) remonté à chaque changement d'URL : sans cette clé, les
 * champs non contrôlés gardaient l'ancienne saisie après « Effacer » ou un raccourci de date, et la soumission
 * suivante renvoyait des filtres périmés (revue du 9 oct. 2026).
 */
export function FilterForm(props: ComponentProps<typeof Form>) {
  const params = useSearchParams();
  return <Form key={params.toString()} {...props} />;
}
