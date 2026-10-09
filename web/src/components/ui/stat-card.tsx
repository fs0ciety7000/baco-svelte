"use client";

import { useRef } from "react";

import { gsap, MOTION, MOTION_OK, useGSAP } from "@/lib/motion";
import { cn } from "@/lib/utils";

import type { Tone } from "./status-badge";

const toneVar: Record<Tone, string> = {
  neutral: "var(--fg-muted)",
  accent: "var(--accent)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  info: "var(--info)",
};

type StatCardProps = {
  label: string;
  value: number;
  tone?: Tone;
  delta?: { value: string; good: boolean };
  hint?: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
};

const formatter = new Intl.NumberFormat("fr-BE");

/**
 * Indicateur : bande multicolore de 2 px, bordure gauche du ton, label mono, valeur display tabulaire
 * animée (compteur GSAP, sans animation si mouvement réduit ou si la valeur ne change pas).
 * Cliquable = filtre (rôle bouton, aria-pressed).
 */
function StatCard({
  label,
  value,
  tone = "neutral",
  delta,
  hint,
  active,
  onClick,
  className,
}: StatCardProps) {
  const ref = useRef<HTMLElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  // Valeur de départ = valeur affichée : aucun compteur au montage (rien n'a changé), seulement sur un vrai changement.
  const previous = useRef(value);

  useGSAP(
    () => {
      const el = valueRef.current;
      if (!el) return;
      const from = previous.current;
      previous.current = value;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        if (from === value) return;
        const state = { v: from };
        gsap.to(state, {
          v: value,
          duration: MOTION.counter,
          ease: "power3.out",
          snap: { v: 1 },
          onUpdate: () => {
            // Nœud texte géré par React : on modifie sa valeur, on ne le remplace pas.
            if (el.firstChild) el.firstChild.nodeValue = formatter.format(state.v);
          },
        });
      });
      return () => mm.revert();
    },
    { scope: ref, dependencies: [value] },
  );

  const Comp = onClick ? "button" : "article";
  return (
    <Comp
      ref={ref as never}
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? !!active : undefined}
      style={{ "--tone": toneVar[tone] } as React.CSSProperties}
      className={cn(
        "chamfer flex min-w-0 flex-col gap-2 p-4 pl-5 text-left",
        active && "[--frame:var(--accent)] [--fill:var(--surface-2)]",
        onClick && "cursor-pointer hover:[--fill:var(--surface-2)]",
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute top-0 left-0 h-0.5 w-16 bg-[linear-gradient(90deg,var(--danger),var(--warn)_35%,var(--accent)_60%,var(--info))]"
      />
      <span aria-hidden className="absolute top-1 bottom-0 left-0 w-0.5 bg-(--tone)" />
      <span className="label-mono text-fg-muted">{label}</span>
      <span className="display tabular text-stat text-fg">
        <span ref={valueRef}>{formatter.format(value)}</span>
      </span>
      {delta || hint ? (
        <span className="flex items-center gap-2 text-small">
          {delta ? (
            <span className={cn("font-mono tabular", delta.good ? "text-ok" : "text-danger")}>
              {delta.value}
            </span>
          ) : null}
          {hint ? <span className="text-fg-muted">{hint}</span> : null}
        </span>
      ) : null}
    </Comp>
  );
}

export { StatCard };
