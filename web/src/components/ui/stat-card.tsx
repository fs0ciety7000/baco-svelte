"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { MOTION, reducedMotion } from "@/lib/motion-core";
import { cn } from "@/lib/utils";

import type { Tone } from "./status-badge";

const toneVar: Record<Tone, string> = {
  neutral: "var(--fg-muted)",
  accent: "var(--accent)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  info: "var(--info)",
  progress: "var(--progress)",
};

const formatter = new Intl.NumberFormat("fr-BE");

/**
 * Compteur animé (requestAnimationFrame, sans GSAP depuis le lot 5) : aucun défilement au montage ni en mouvement
 * réduit, seulement quand la valeur change vraiment (600 ms, power3.out, valeurs entières). Le nœud texte est géré par
 * React : on modifie sa valeur, on ne le remplace pas.
 */
function useCounter(value: number) {
  const scope = useRef<HTMLElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const previous = useRef(value);
  useEffect(() => {
    const el = valueRef.current;
    const from = previous.current;
    previous.current = value;
    if (!el || from === value || reducedMotion()) return;
    const start = performance.now();
    const ms = MOTION.counter * 1000;
    let frame = 0;
    const write = (v: number) => {
      if (el.firstChild) el.firstChild.nodeValue = formatter.format(v);
    };
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - t) ** 3;
      write(Math.round(from + (value - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      write(value);
    };
  }, [value]);
  return { scope, valueRef };
}

/**
 * Bande de compteurs (v4, 15 oct. 2026) : une seule boîte, cellules séparées d'un trait, passe à la ligne sans trou.
 * Filet accent au-dessus dans la direction Quai (`--strip-rule`). Contient des `<Stat>`.
 */
function StatStrip({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="stat-strip"
      className={cn(
        "grid grid-cols-[repeat(auto-fill,minmax(min(100%,9.5rem),1fr))] overflow-hidden rounded-box border border-border border-t-(length:--strip-rule) border-t-accent bg-surface shadow-rest",
        className,
      )}
      {...props}
    />
  );
}

type StatProps = {
  label: string;
  value: number;
  /** Ton de la cellule « chaude » (valeur colorée, fond teinté à 7 %) ; sans ton ou à zéro : neutre. */
  tone?: Tone;
  /** Détail d'une ligne (masqué sous 640 px). */
  hint?: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  className?: string;
};

/**
 * Cellule de la bande : libellé 13 px, valeur `text-kpi` en chiffres tabulaires de la police du texte (fin du zéro barré
 * de la mono), zéro estompé. Lien (`href`), filtre (`onClick` → bouton `aria-pressed`) ou simple affichage.
 */
function Stat({ label, value, tone, hint, href, onClick, active, className }: StatProps) {
  const { scope, valueRef } = useCounter(value);
  const hot = !!tone && tone !== "neutral" && value !== 0;
  const body = (
    <>
      <span className="label-mono truncate text-fg-muted">{label}</span>
      <span
        className={cn(
          "figures text-h3 text-fg sm:text-kpi",
          value === 0 && "font-medium text-fg-subtle",
          hot && "text-(--tone)",
        )}
      >
        <span ref={valueRef}>{formatter.format(value)}</span>
      </span>
      {hint ? (
        <span className="hidden truncate text-label tracking-normal text-fg-subtle sm:block">
          {hint}
        </span>
      ) : null}
    </>
  );
  const cls = cn(
    "-mt-px -ml-px flex min-w-0 flex-col gap-0.5 border-t border-l border-border px-4 py-3 text-left",
    hot && "bg-[color-mix(in_oklab,var(--tone)_7%,var(--surface))]",
    (href || onClick) && "cursor-pointer transition-colors hover:bg-surface-2",
    active && "bg-accent-soft hover:bg-accent-soft",
    className,
  );
  const style = { "--tone": toneVar[tone ?? "neutral"] } as React.CSSProperties;
  if (href)
    return (
      <Link ref={scope as never} href={href} style={style} className={cls}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button
        ref={scope as never}
        type="button"
        onClick={onClick}
        aria-pressed={!!active}
        style={style}
        className={cls}
      >
        {body}
      </button>
    );
  return (
    <div ref={scope as never} style={style} className={cls}>
      {body}
    </div>
  );
}

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

/**
 * Indicateur isolé (Statistiques, widgets) : carte du thème, filet gauche du ton, valeur `text-kpi` en chiffres de la
 * police du texte (v4) ou des titres (« Autres thèmes »). Préférer `StatStrip` + `Stat` pour une rangée de compteurs.
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
  const { scope, valueRef } = useCounter(value);
  const Comp = onClick ? "button" : "article";
  return (
    <Comp
      ref={scope as never}
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? !!active : undefined}
      style={{ "--tone": toneVar[tone] } as React.CSSProperties}
      className={cn(
        "chamfer flex min-w-0 flex-col gap-1 p-4 pl-5 text-left shadow-rest [--frame:var(--card-frame)]",
        active && "[--frame:var(--accent)] [--fill:var(--surface-2)]",
        onClick && "cursor-pointer hover:[--fill:var(--surface-2)]",
        className,
      )}
    >
      <span aria-hidden className="absolute top-1 bottom-0 left-0 w-0.5 bg-(--tone)" />
      <span className="label-mono truncate text-fg-muted">{label}</span>
      <span className="figures text-kpi text-fg">
        <span ref={valueRef}>{formatter.format(value)}</span>
      </span>
      {delta || hint ? (
        <span className="flex items-center gap-2 text-small">
          {delta ? (
            <span className={cn("tabular", delta.good ? "text-ok" : "text-danger")}>
              {delta.value}
            </span>
          ) : null}
          {hint ? <span className="text-fg-muted">{hint}</span> : null}
        </span>
      ) : null}
    </Comp>
  );
}

export { Stat, StatCard, StatStrip };
