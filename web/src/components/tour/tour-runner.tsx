"use client";

import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { EASE, reducedMotion } from "@/lib/motion-core";
import { flipFrom, placeCard, sheetSide, spotlightBox, type Box } from "@/lib/tour/position";
import type { PlannedStep } from "@/lib/tour/steps";
import { cn } from "@/lib/utils";

import { boxOf, bringIntoView, findTarget, viewport } from "./dom";

/** Durée des transitions entre deux cibles (transform / opacity seulement). */
const MOVE_MS = 280;
/** Attente d'une cible : plus longue après un changement de page (compilation en développement, données). */
const WAIT_NAV_MS = 10_000;
const WAIT_MS = 2_500;
const MOBILE = "(max-width: 767px)";

export type TourEnd = "done" | "skipped";

/**
 * Déroulé de la visite : voile avec une découpe autour de la cible (ombre portée géante d'un cadre posé à la place de
 * la cible, animé en FLIP), carte « titre, texte, 3 / 12, Précédent / Suivant / Passer » placée près de la cible (feuille
 * pleine largeur en mobile, en haut quand la cible est en bas). Une étape peut changer de page puis attendre sa cible ;
 * cible introuvable = carte centrée (`fallback: "center"`) ou étape sautée. Échap ferme, ← / → naviguent, le focus
 * reste dans la carte et revient à l'élément d'origine à la fin. Rien ne bouge en mouvement réduit.
 */
export function TourRunner({
  steps,
  onEnd,
}: {
  steps: PlannedStep[];
  onEnd: (reason: TourEnd) => void;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState<{ index: number; target: HTMLElement | null } | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [mobile, setMobile] = useState(false);
  const [sheet, setSheet] = useState<"bottom" | "top">("bottom");
  const dir = useRef<1 | -1>(1);
  const holeRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const prevHole = useRef<Box | null>(null);
  const prevCard = useRef<{ top: number; left: number } | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  // Dernière étape animée (découpe, carte) : une mesure au défilement ne rejoue pas la transition.
  const holeStep = useRef(-1);
  const cardStep = useRef(-1);
  const titleId = useId();
  const bodyId = useId();

  const step = shown ? steps[shown.index] : undefined;
  const total = steps.length;

  // Focus rendu à la fin ; format d'écran suivi en direct.
  useEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    const mq = window.matchMedia(MOBILE);
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      returnFocus.current?.focus?.({ preventScroll: true });
    };
  }, []);

  const finish = useCallback((reason: TourEnd) => onEnd(reason), [onEnd]);

  // Recherche de la cible de l'étape courante (navigation au besoin).
  useEffect(() => {
    const s = steps[index];
    if (!s) return void finish("done");
    let cancelled = false;
    const navigating = !!s.path && window.location.pathname !== s.path;
    if (navigating) router.push(s.path!);
    const started = performance.now();
    const limit = navigating ? WAIT_NAV_MS : WAIT_MS;
    let timer = 0;
    const tick = () => {
      if (cancelled) return;
      const onPage = !s.path || window.location.pathname === s.path;
      const el = onPage ? findTarget(s.targets) : null;
      if (el) {
        // Défilement immédiat : la découpe glisse ensuite vers la position finale (une seule animation).
        bringIntoView(el);
        // Boîte posée avec l'étape : la découpe glisse dès ce rendu (sinon elle sauterait au rendu suivant).
        setBox(boxOf(el));
        setShown({ index, target: el });
        return;
      }
      if (performance.now() - started > limit) {
        if (onPage && s.fallback === "center") {
          setBox(null);
          return void setShown({ index, target: null });
        }
        // Étape sautée : même sens ; avant la première, on repart en avant.
        const to = index + dir.current;
        if (to < 0) {
          dir.current = 1;
          setIndex(index + 1);
        } else setIndex(to);
        return;
      }
      timer = window.setTimeout(tick, 100);
    };
    timer = window.setTimeout(tick, navigating ? 150 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- relancée à chaque étape seulement
  }, [index]);

  // Mesure de la cible : au défilement, au redimensionnement, quand elle change de taille.
  useEffect(() => {
    const el = shown?.target;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!el.isConnected) return;
        setBox(boxOf(el));
      });
    };
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [shown]);

  // Découpe : posée à sa place finale, animée en transform depuis l'ancienne (FLIP).
  useLayoutEffect(() => {
    const hole = holeRef.current;
    if (!hole || !shown) return;
    const vp = viewport();
    const to = box
      ? spotlightBox(box, vp)
      : { top: vp.height / 2, left: vp.width / 2, width: 0, height: 0 };
    hole.style.transform = `translate(${to.left}px, ${to.top}px)`;
    hole.style.width = `${to.width}px`;
    hole.style.height = `${to.height}px`;
    const from = prevHole.current;
    prevHole.current = to;
    if (!from || reducedMotion() || from.width === 0 || to.width === 0) return;
    if (Math.abs(from.left - to.left) + Math.abs(from.top - to.top) < 2 && from.width === to.width)
      return;
    // Mesure au défilement : pas d'animation (la découpe suit la cible).
    if (holeStep.current === shown.index) return;
    const f = flipFrom(from, to);
    hole.animate(
      [
        {
          transform: `translate(${to.left + f.x}px, ${to.top + f.y}px) scale(${f.sx}, ${f.sy})`,
        },
        { transform: `translate(${to.left}px, ${to.top}px) scale(1, 1)` },
      ],
      { duration: MOVE_MS, easing: EASE.out },
    );
  }, [box, shown]);

  useLayoutEffect(() => {
    if (shown) holeStep.current = shown.index;
  });

  // Carte : placée près de la cible (desktop) ; feuille du bas ou du haut (mobile).
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || !shown) return;
    const vp = viewport();
    if (mobile) {
      card.style.top = "";
      card.style.left = "";
      const side = sheetSide(box, card.offsetHeight, vp);
      if (side !== sheet) setSheet(side);
      prevCard.current = null;
      return;
    }
    const pos = placeCard(box, { width: card.offsetWidth, height: card.offsetHeight }, vp);
    card.style.top = `${pos.top}px`;
    card.style.left = `${pos.left}px`;
    const from = prevCard.current;
    prevCard.current = { top: pos.top, left: pos.left };
    if (!from || reducedMotion() || cardStep.current === shown.index) return;
    card.animate(
      [
        { transform: `translate(${from.left - pos.left}px, ${from.top - pos.top}px)` },
        { transform: "translate(0, 0)" },
      ],
      { duration: MOVE_MS, easing: EASE.out },
    );
  }, [box, shown, mobile, sheet]);

  // Nouvelle étape affichée : contenu en fondu, focus sur l'action principale.
  useEffect(() => {
    const card = cardRef.current;
    if (!card || !shown) return;
    cardStep.current = shown.index;
    if (!reducedMotion())
      card.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 200, easing: EASE.out });
    nextRef.current?.focus({ preventScroll: true });
  }, [shown]);

  const go = useCallback(
    (delta: 1 | -1) => {
      if (!shown) return;
      const to = shown.index + delta;
      if (to < 0) return;
      if (to >= total) return finish("done");
      dir.current = delta;
      setIndex(to);
    },
    [shown, total, finish],
  );

  // Clavier : Échap ferme, ← / → naviguent, Tab reste dans la carte ; les raccourcis de CSM sont suspendus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        return finish("skipped");
      }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        return go(e.key === "ArrowRight" ? 1 : -1);
      }
      if (e.key === "Tab") {
        const card = cardRef.current;
        if (!card) return;
        const items = [...card.querySelectorAll<HTMLElement>("button:not([disabled])")];
        if (!items.length) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        const n = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i + 1) % items.length;
        items[n]!.focus();
        return;
      }
      if (e.key === "Enter" || e.key === " ") return;
      // Ctrl K, « / », « N »… : rien n'est ouvert sous le voile.
      e.stopPropagation();
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [go, finish]);

  const last = shown ? shown.index === total - 1 : false;

  return (
    <div data-tour-root="" data-testid="tour" className="fixed inset-0 z-[65]">
      {/* Bloque la page pendant la visite (la carte reste cliquable). */}
      <div aria-hidden className="absolute inset-0" />
      <div
        ref={holeRef}
        aria-hidden
        data-testid="tour-spotlight"
        data-target={box ? "on" : "off"}
        className="pointer-events-none absolute top-0 left-0 origin-top-left rounded-control"
        style={{
          boxShadow: box
            ? "0 0 0 2px var(--accent), 0 0 0 200vmax color-mix(in oklab, var(--bg) 72%, transparent)"
            : "0 0 0 200vmax color-mix(in oklab, var(--bg) 72%, transparent)",
          opacity: shown ? 1 : 0.6,
        }}
      />
      {step ? (
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          data-testid="tour-card"
          data-step={step.id}
          className={cn(
            "fixed flex flex-col gap-2 rounded-box border border-border bg-surface p-4 text-fg shadow-float",
            mobile
              ? cn(
                  "inset-x-3",
                  sheet === "bottom" ? "bottom-[calc(var(--safe-bottom)+0.75rem)]" : "top-3",
                )
              : "w-[min(22.5rem,calc(100vw-1.5rem))]",
          )}
        >
          <p className="label-mono flex items-center gap-2 text-fg-muted">
            <span className="min-w-0 truncate">{step.chapterTitle}</span>
            <span aria-hidden>·</span>
            <span className="tabular" data-testid="tour-counter">
              {shown!.index + 1} / {total}
            </span>
          </p>
          <h2 id={titleId} className="text-h3 font-semibold">
            {step.title}
          </h2>
          <p id={bodyId} className="text-body text-fg-muted">
            {step.body}
          </p>
          <div aria-hidden className="my-1 h-1 overflow-hidden rounded-pill bg-surface-3">
            <div
              className="h-full origin-left rounded-pill bg-accent transition-transform duration-300 ease-hud motion-reduce:transition-none"
              style={{ transform: `scaleX(${(shown!.index + 1) / total})` }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 max-md:h-11"
              onClick={() => finish("skipped")}
              data-testid="tour-skip"
            >
              <X aria-hidden /> Passer
            </Button>
            <span className="flex-1" />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="max-md:h-11"
              onClick={() => go(-1)}
              disabled={shown!.index === 0}
              aria-label="Précédent"
              data-testid="tour-prev"
            >
              <ArrowLeft aria-hidden /> <span className="max-sm:sr-only">Précédent</span>
            </Button>
            <Button
              ref={nextRef}
              type="button"
              variant="primary"
              size="sm"
              className="max-md:h-11"
              onClick={() => go(1)}
              data-testid="tour-next"
            >
              {last ? (
                <>
                  <Check aria-hidden /> Terminer
                </>
              ) : (
                <>
                  Suivant <ArrowRight aria-hidden />
                </>
              )}
            </Button>
          </div>
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {step ? `Étape ${shown!.index + 1} sur ${total} : ${step.title}` : "Chargement de l'étape…"}
      </p>
    </div>
  );
}
