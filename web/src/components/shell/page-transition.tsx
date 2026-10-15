"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

import { playEnter } from "@/lib/motion-core";

/**
 * Transition de page (CSS, lot 5) : à chaque changement de route côté client, le corps de la page entre en fondu avec un
 * léger glissement (6 px, 320 ms, `--ease-out` ; `.motion-enter` de globals.css). Jamais au premier affichage (contenu
 * serveur déjà peint), jamais sur un simple changement de filtre (même chemin), rien en mouvement réduit. L'en-tête du
 * module et ses onglets ne bougent pas. Aucune dépendance à GSAP (le shell est dans le bundle de chaque page).
 */
export function PageTransition() {
  const pathname = usePathname();
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const main = document.getElementById("contenu");
    const target = main?.querySelector<HTMLElement>("[data-page-body]") ?? main;
    if (!target) return;
    return playEnter([target], { cascade: false });
  }, [pathname]);
  return null;
}
