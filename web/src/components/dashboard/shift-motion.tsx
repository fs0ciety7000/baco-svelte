"use client";

import type { gsap as Gsap } from "gsap";
import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { reducedMotion } from "@/lib/motion-core";
import { cn } from "@/lib/utils";

// Mouvement du widget « Fin de service » (5 nov. 2026, demande : « heure qui défile + secondes, barre d'avancement plus jolie
// et motion, GSAP »). GSAP est chargé à la demande (`import()`, comme les emblèmes du pied de page) : il ne pèse pas sur le
// bundle de Temps réel, et rien n'est chargé ni animé en mouvement réduit (chiffres posés, barre sans balayage).

export type GsapApi = typeof Gsap;

let gsapPromise: Promise<GsapApi> | null = null;
const loadGsap = () => (gsapPromise ??= import("gsap").then((m) => m.gsap as GsapApi));

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** GSAP une fois chargé, sinon `null` (premier rendu, mouvement réduit, échec du chargement). */
export function useLazyGsap(): GsapApi | null {
  const [api, setApi] = useState<GsapApi | null>(null);
  useEffect(() => {
    if (reducedMotion()) return;
    let alive = true;
    loadGsap()
      .then((g) => alive && setApi(() => g))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return api;
}

/**
 * Un chiffre qui défile : l'ancien monte et s'efface, le nouveau arrive par le bas (masqué par la cellule). Sans GSAP, le
 * chiffre change simplement (premier rendu identique côté serveur et à l'hydratation).
 */
function RollDigit({ ch, gsap }: { ch: string; gsap: GsapApi | null }) {
  const [pair, setPair] = useState<{ cur: string; prev: string | null; n: number }>({
    cur: ch,
    prev: null,
    n: 0,
  });
  if (pair.cur !== ch) setPair({ cur: ch, prev: gsap ? pair.cur : null, n: pair.n + 1 });
  const curRef = useRef<HTMLSpanElement>(null);
  const prevRef = useRef<HTMLSpanElement>(null);

  useIsoLayoutEffect(() => {
    if (!gsap || pair.prev === null || !curRef.current || !prevRef.current) return;
    const n = pair.n;
    const tl = gsap.timeline({
      onComplete: () => setPair((p) => (p.n === n ? { ...p, prev: null } : p)),
    });
    tl.fromTo(
      curRef.current,
      { yPercent: 105, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 0.55, ease: "expo.out" },
      0,
    ).fromTo(
      prevRef.current,
      { yPercent: 0, opacity: 1 },
      { yPercent: -105, opacity: 0, duration: 0.35, ease: "power2.in" },
      0,
    );
    return () => {
      tl.kill();
    };
  }, [pair.n, gsap]);

  return (
    <span className="relative inline-block overflow-hidden align-top leading-[1.05]">
      <span ref={curRef} className="block will-change-transform">
        {pair.cur}
      </span>
      {pair.prev !== null ? (
        <span ref={prevRef} className="absolute inset-0 block will-change-transform">
          {pair.prev}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Heure « HH:MM:SS » qui défile chiffre par chiffre ; les secondes en plus petit (`secondsClassName`). Le texte lisible est
 * porté par `label` (lecteurs d'écran), les chiffres animés sont masqués.
 */
export function RollingTime({
  value,
  label,
  gsap,
  className,
  secondsClassName,
  testId,
}: {
  value: string;
  label: string;
  gsap: GsapApi | null;
  className?: string;
  secondsClassName?: string;
  testId?: string;
}) {
  const [main, seconds] = useMemo(() => {
    const i = value.lastIndexOf(":");
    return i > 0 && value.length - i === 3 ? [value.slice(0, i), value.slice(i)] : [value, ""];
  }, [value]);
  const digits = (text: string, offset: number) =>
    [...text].map((c, i) =>
      /\d/.test(c) ? (
        <RollDigit key={offset + i} ch={c} gsap={gsap} />
      ) : (
        <span key={offset + i} className="inline-block align-top leading-[1.05]">
          {c}
        </span>
      ),
    );
  return (
    <span className={cn("inline-flex items-baseline tabular", className)} data-testid={testId}>
      <span className="sr-only">{label}</span>
      <span aria-hidden className="inline-flex">
        {digits(main, 0)}
      </span>
      {seconds ? (
        <span aria-hidden className={cn("inline-flex", secondsClassName)}>
          {digits(seconds, main.length)}
        </span>
      ) : null}
    </span>
  );
}

const brusselsHour = new Intl.DateTimeFormat("fr-BE", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Europe/Brussels",
});

/** Heures pleines strictement comprises dans le service, en part de la durée (repères de la barre). */
export function hourTicks(start: Date, end: Date): number[] {
  const span = end.getTime() - start.getTime();
  if (span <= 0) return [];
  const out: number[] = [];
  const first = Math.ceil(start.getTime() / 3_600_000) * 3_600_000;
  for (let t = first; t < end.getTime(); t += 3_600_000) {
    if (t > start.getTime()) out.push((t - start.getTime()) / span);
  }
  return out.length > 24 ? [] : out;
}

/**
 * Barre d'avancement du service : piste creusée, remplissage en dégradé qui se dévoile au montage (GSAP), reflet qui la
 * parcourt de temps en temps, repère lumineux en tête, graduations aux heures pleines, début et fin dessous. Couleur `ok`
 * dans le dernier quart d'heure.
 */
export function ShiftProgress({
  progress,
  start,
  end,
  ending,
  gsap,
  size = "md",
}: {
  progress: number;
  start: Date;
  end: Date;
  /** Dernier quart d'heure : la barre passe à la couleur `ok`. */
  ending: boolean;
  gsap: GsapApi | null;
  size?: "md" | "lg";
}) {
  const p = Math.min(1, Math.max(0, progress));
  const pct = Math.round(p * 100);
  const reveal = useRef<HTMLDivElement>(null);
  const sheen = useRef<HTMLSpanElement>(null);
  const head = useRef<HTMLSpanElement>(null);
  const ticks = useMemo(() => hourTicks(start, end), [start, end]);
  const tone = ending ? "var(--ok)" : "var(--progress)";

  // Entrée : la barre se dévoile de gauche à droite, puis le repère apparaît ; reflet toutes les ~7 s ensuite.
  useIsoLayoutEffect(() => {
    if (!gsap || !reveal.current || !head.current || !sheen.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        reveal.current,
        { clipPath: "inset(0 100% 0 0)" },
        { clipPath: "inset(0 0% 0 0)", duration: 1.4, ease: "expo.out", clearProps: "clipPath" },
      );
      gsap.fromTo(
        head.current,
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.6, delay: 0.9, ease: "back.out(2.2)" },
      );
      gsap.fromTo(
        sheen.current,
        { xPercent: -120, opacity: 1 },
        {
          xPercent: 420,
          duration: 1.6,
          ease: "power2.inOut",
          delay: 1.4,
          repeat: -1,
          repeatDelay: 6,
        },
      );
    });
    return () => ctx.revert();
  }, [gsap]);

  return (
    <div className="flex flex-col gap-1.5" data-testid="shift-progress">
      <div className="relative">
        <div
          role="progressbar"
          aria-label="Service écoulé"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={`${pct} %`}
          className={cn(
            "relative overflow-hidden rounded-pill bg-surface-2 shadow-[inset_0_1px_2px_color-mix(in_oklab,var(--fg)_14%,transparent)]",
            size === "lg" ? "h-3.5" : "h-3",
          )}
        >
          <div ref={reveal} className="absolute inset-0">
            <div
              className="absolute inset-y-0 left-0 overflow-hidden rounded-pill transition-[width,background] duration-1000 ease-linear motion-reduce:transition-none"
              style={
                {
                  width: `${(p * 100).toFixed(3)}%`,
                  background: `linear-gradient(90deg, color-mix(in oklab, ${tone} 45%, transparent), ${tone})`,
                } as CSSProperties
              }
            >
              <span
                ref={sheen}
                aria-hidden
                className="absolute inset-y-0 left-0 w-1/4 bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--surface)_55%,transparent),transparent)] opacity-0"
              />
            </div>
          </div>
          {ticks.map((t) => (
            <span
              key={t}
              aria-hidden
              className="absolute inset-y-0 w-px bg-[color-mix(in_oklab,var(--bg)_55%,transparent)]"
              style={{ left: `${(t * 100).toFixed(3)}%` }}
            />
          ))}
        </div>
        {/* Repère en tête : hors de la piste (qui coupe ce qui déborde), suit l'avancement. */}
        <span
          ref={head}
          aria-hidden
          className="pointer-events-none absolute top-1/2 transition-[left] duration-1000 ease-linear motion-reduce:transition-none"
          style={{ left: `${(p * 100).toFixed(3)}%` }}
        >
          <span
            className={cn(
              "block -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-surface",
              size === "lg" ? "size-5" : "size-4",
            )}
            style={{
              background: tone,
              boxShadow: `0 0 0 4px color-mix(in oklab, ${tone} 22%, transparent), 0 0 14px color-mix(in oklab, ${tone} 55%, transparent)`,
            }}
          />
        </span>
      </div>
      <div className="flex items-center justify-between font-mono text-label text-fg-subtle tabular">
        <span>{brusselsHour.format(start)}</span>
        <span className="text-fg-muted">{pct} %</span>
        <span>{brusselsHour.format(end)}</span>
      </div>
    </div>
  );
}

/** Fondu + léger glissement d'un bloc quand `key` change (jamais au premier rendu). */
export function useSwapIn<T extends HTMLElement>(gsap: GsapApi | null, key: string) {
  const ref = useRef<T>(null);
  const first = useRef(true);
  useIsoLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!gsap || !ref.current) return;
    const tw = gsap.fromTo(
      ref.current,
      { y: 8, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.45, ease: "power3.out", clearProps: "transform,opacity" },
    );
    return () => {
      tw.kill();
    };
  }, [key]);
  return ref;
}
