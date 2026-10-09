"use client";

import { useRef } from "react";

import { gsap, MOTION_OK, useGSAP } from "@/lib/motion";

/**
 * Écran de connexion : seul endroit où un peu de mise en scène est permise (audit UI F12). Les lettres de « CSM »
 * montent une à une, le sourcil et le sous-titre suivent, le filet d'accent se trace. Les éléments partent masqués
 * dès le premier rendu (classe `intro-*`, pas de flash), avec un repli CSS qui les montre après 1,2 s si GSAP ne
 * tourne pas ; en mouvement réduit, tout est visible tout de suite.
 */
export function LoginIntro() {
  const ref = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const tl = gsap.timeline({ defaults: { ease: "hud" } });
        tl.set(".intro-hide", { animation: "none" })
          .fromTo(
            ".intro-char",
            { yPercent: 110, autoAlpha: 0 },
            { yPercent: 0, autoAlpha: 1, duration: 0.5, stagger: 0.07 },
          )
          .fromTo(
            ".intro-rule",
            { scaleX: 0, autoAlpha: 1 },
            { scaleX: 1, duration: 0.45, transformOrigin: "left center" },
            "-=0.25",
          )
          .fromTo(
            ".intro-fade",
            { y: 6, autoAlpha: 0 },
            { y: 0, autoAlpha: 1, duration: 0.35, stagger: 0.06 },
            "-=0.3",
          );
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <header ref={ref} className="flex flex-col gap-2">
      <p className="intro-hide intro-fade label-mono flex items-center gap-2 text-fg-muted">
        <span aria-hidden className="size-2 bg-accent" /> SNCB · Client Solutions
      </p>
      <h1 className="display flex overflow-hidden text-h1" aria-label="CSM">
        {"CSM".split("").map((c, i) => (
          <span key={i} aria-hidden className="intro-hide intro-char inline-block">
            {c}
          </span>
        ))}
      </h1>
      <span aria-hidden className="intro-hide intro-rule block h-0.5 w-16 bg-accent" />
      <p className="intro-hide intro-fade text-body text-fg-muted">
        Client Solutions Management Tool
      </p>
    </header>
  );
}
