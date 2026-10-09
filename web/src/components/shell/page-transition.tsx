"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

import { gsap, MOTION, NO_MOTION } from "@/lib/motion";

/**
 * Transition de page (GSAP) : à chaque changement de route côté client, le corps de la page entre en fondu avec un
 * léger glissement (240 ms). Jamais au premier affichage (contenu serveur déjà peint), jamais sur un simple changement
 * de filtre (même chemin), rien en mouvement réduit. L'en-tête du module et ses onglets ne bougent pas.
 */
export function PageTransition() {
  const pathname = usePathname();
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (window.matchMedia(NO_MOTION).matches) return;
    const main = document.getElementById("contenu");
    const target = main?.querySelector<HTMLElement>("[data-page-body]") ?? main;
    if (!target) return;
    const tween = gsap.fromTo(
      target,
      { autoAlpha: 0, y: 6 },
      {
        autoAlpha: 1,
        y: 0,
        duration: MOTION.enter,
        ease: "hud",
        clearProps: "opacity,visibility,transform",
      },
    );
    return () => {
      tween.progress(1).kill();
    };
  }, [pathname]);
  return null;
}
