"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { Flip } from "gsap/Flip";
import type { RefObject } from "react";

// Motion CSM (DESIGN-DIRECTION.md § Motion) : toute animation passe par gsap.matchMedia() pour respecter
// prefers-reduced-motion. En mouvement réduit, seuls les fondus courts (ou rien) sont joués.

gsap.registerPlugin(useGSAP, CustomEase, Flip);
CustomEase.create("hud", "0.2, 0, 0, 1");

export const MOTION = { micro: 0.15, enter: 0.24, panel: 0.22, exit: 0.16, counter: 0.6 } as const;
export const NO_MOTION = "(prefers-reduced-motion: reduce)";
export const MOTION_OK = "(prefers-reduced-motion: no-preference)";

/** Entrée en cascade des enfants marqués [data-stagger] (8 au plus animés, les suivants apparaissent directement). */
export function useStaggerIn(scope: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useGSAP(
    () => {
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

export { Flip, gsap, useGSAP };
