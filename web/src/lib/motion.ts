"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { Flip } from "gsap/Flip";
import { type RefObject, useRef } from "react";

// Motion CSM (DESIGN-DIRECTION.md § Motion) : toute animation passe par gsap.matchMedia() pour respecter
// prefers-reduced-motion. En mouvement réduit, seuls les fondus courts (ou rien) sont joués.

gsap.registerPlugin(useGSAP, CustomEase, Flip);
CustomEase.create("hud", "0.2, 0, 0, 1");

export const MOTION = { micro: 0.15, enter: 0.24, panel: 0.22, exit: 0.16, counter: 0.6 } as const;
export const NO_MOTION = "(prefers-reduced-motion: reduce)";
export const MOTION_OK = "(prefers-reduced-motion: no-preference)";

// Premier affichage de la page (rendu serveur déjà peint) : aucune entrée animée, sinon le contenu visible
// disparaît puis revient en fondu (« flash » mesuré par l'audit motion du 9 oct. 2026). Les navigations client suivantes
// animent normalement.
let firstPaint = true;

/** Entrée en cascade des enfants marqués [data-stagger] (8 au plus animés, les suivants apparaissent directement). */
export function useStaggerIn(scope: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useGSAP(
    () => {
      if (firstPaint) {
        firstPaint = false;
        return;
      }
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const items = gsap.utils.toArray<HTMLElement>("[data-stagger]");
        gsap.from(items.slice(0, 8), {
          y: 8,
          autoAlpha: 0,
          duration: MOTION.enter,
          ease: "hud",
          stagger: 0.03,
          clearProps: "transform,opacity,visibility",
        });
      });
      return () => mm.revert();
    },
    { scope, dependencies: deps },
  );
}

/**
 * Trait d'onglet qui glisse (primitive `slide-indicator`) : placé sans animation au montage, puis `x` + `scaleX`
 * (propriétés composées, pas `width`) quand l'élément actif change. `bar` = trait de 1 px de large,
 * `transform-origin: left`. Un seul abonnement `matchMedia` par montage.
 */
export function useSlideIndicator(
  list: RefObject<HTMLElement | null>,
  bar: RefObject<HTMLElement | null>,
  selector: string,
  deps: unknown[] = [],
) {
  const placed = useRef(false);
  useGSAP(
    () => {
      const root = list.current;
      const line = bar.current;
      if (!root || !line) return;
      const reduce = window.matchMedia(NO_MOTION);
      const place = (animate: boolean) => {
        const active = root.querySelector<HTMLElement>(selector);
        if (!active) return void gsap.set(line, { autoAlpha: 0 });
        const to = { x: active.offsetLeft, scaleX: active.offsetWidth, autoAlpha: 1 };
        if (animate && placed.current && !reduce.matches)
          gsap.to(line, { ...to, duration: MOTION.panel, ease: "hud", overwrite: true });
        else gsap.set(line, to);
        placed.current = true;
      };
      place(true);
      const observer = new MutationObserver(() => place(true));
      observer.observe(root, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-state", "aria-current"],
      });
      const onResize = () => place(false);
      window.addEventListener("resize", onResize);
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", onResize);
      };
    },
    { scope: list, dependencies: deps },
  );
}

export { Flip, gsap, useGSAP };
