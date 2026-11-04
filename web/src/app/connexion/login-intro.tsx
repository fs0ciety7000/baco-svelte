import type { CSSProperties } from "react";

import { CsmLogo } from "@/components/brand/csm-logo";

/**
 * Écran de connexion : seul endroit où un peu de mise en scène est permise (audit UI F12). Le logo CSM apparaît et son
 * point de correspondance parcourt le symbole (identité du 4 nov. 2026), le sourcil et le sous-titre suivent, le filet d'accent se trace. Entièrement en CSS depuis le lot 5
 * (`.intro-*` dans globals.css, même minutage que l'ancienne frise GSAP) : rien à charger, pas de flash (les éléments
 * partent masqués par l'animation elle-même), tout visible d'emblée en mouvement réduit.
 */
export function LoginIntro() {
  const i = (n: number) => ({ "--i": n }) as CSSProperties;
  return (
    <header className="flex flex-col gap-2">
      <p style={i(0)} className="intro-fade label-mono flex items-center gap-2 text-fg-muted">
        <span aria-hidden className="size-2 rounded-pill bg-[var(--brand-sable)]" /> SNCB · Client
        Solutions
      </p>
      <h1 className="m-0 py-1" aria-label="CSM">
        <span style={i(0)} className="intro-fade block">
          <CsmLogo animate decorative className="h-11 w-auto" />
        </span>
      </h1>
      <span
        aria-hidden
        className="intro-rule block h-0.5 w-16 origin-left bg-[var(--brand-sable)]"
      />
      <p style={i(1)} className="intro-fade text-body text-fg-muted">
        Client Solutions Management Tool
      </p>
    </header>
  );
}
