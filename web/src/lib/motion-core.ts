"use client";

import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

// Mouvement CSM sans GSAP (refonte v4, lot 5, 15 oct. 2026) : arrivée de page et cascades en CSS (`@keyframes` de
// globals.css), trait d'onglet, `highlight` et continuité ligne → panneau par l'API Web Animations. Ce module ne doit
// jamais importer `gsap` : le shell et les composants de `ui/` en dépendent, GSAP sortirait du bundle initial de chaque
// page. GSAP reste disponible dans `@/lib/motion` pour les mises en scène propres à une page (frise, écran commun,
// intro de connexion, chargées à la demande).

export const MOTION = {
  micro: 0.15,
  enter: 0.32,
  panel: 0.22,
  exit: 0.16,
  counter: 0.6,
  highlight: 1.2,
} as const;
export const NO_MOTION = "(prefers-reduced-motion: reduce)";
export const MOTION_OK = "(prefers-reduced-motion: no-preference)";
/** Courbes (miroir de `--ease-hud` / `--ease-out` de globals.css). */
export const EASE = {
  hud: "cubic-bezier(0.2, 0, 0, 1)",
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  in: "ease-in",
} as const;
/** Cascade d'entrée : 4 blocs au plus, 40 ms d'écart (DESIGN-DIRECTION § Motion). */
export const CASCADE = { max: 4, step: 40 } as const;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function reducedMotion(): boolean {
  return typeof window === "undefined" || window.matchMedia(NO_MOTION).matches;
}

/**
 * Joue l'arrivée CSS (`.motion-enter` : fondu + 6 px, 320 ms, `--ease-out`) sur `els`, en cascade de 40 ms pour les
 * 4 premiers ; les suivants s'affichent directement. La classe est retirée à la fin (rien ne reste dans le style).
 * Rien en mouvement réduit.
 */
export function playEnter(els: HTMLElement[], { cascade = true }: { cascade?: boolean } = {}) {
  if (!els.length || reducedMotion()) return () => {};
  const played = els.slice(0, cascade ? CASCADE.max : els.length);
  const done = (el: HTMLElement) => {
    el.classList.remove("motion-enter");
    el.style.removeProperty("--enter-delay");
  };
  played.forEach((el, i) => {
    el.classList.remove("motion-enter");
    // Relance l'animation si la classe était déjà là (navigation rapide).
    void el.offsetWidth;
    if (cascade && i) el.style.setProperty("--enter-delay", `${i * CASCADE.step}ms`);
    el.classList.add("motion-enter");
    el.addEventListener("animationend", () => done(el), { once: true });
    el.addEventListener("animationcancel", () => done(el), { once: true });
  });
  return () => played.forEach(done);
}

// Premier affichage de la page (rendu serveur déjà peint) : aucune entrée animée, sinon le contenu visible
// disparaît puis revient en fondu (« flash » mesuré par l'audit motion du 9 oct. 2026). Les navigations client suivantes
// animent normalement.
let firstPaint = true;

/** Entrée en cascade des enfants marqués [data-stagger] (4 au plus animés, 40 ms d'écart ; CSS). */
export function useStaggerIn(scope: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useIsoLayoutEffect(() => {
    if (firstPaint) {
      firstPaint = false;
      return;
    }
    const root = scope.current;
    if (!root) return;
    return playEnter([...root.querySelectorAll<HTMLElement>("[data-stagger]")]);
    // `deps` : relance voulue par l'appelant.
  }, deps);
}

/**
 * Trait d'onglet qui glisse (primitive `slide-indicator`) : placé sans animation au montage, puis glisse quand
 * l'élément actif change. La largeur finale est posée d'un coup (élément absolu, sans effet sur la mise en page) et seul
 * `transform` est animé (`translateX` + `scaleX` depuis l'ancienne place, technique FLIP) : bouts arrondis intacts à
 * l'arrivée, aucune animation de `width`. `inset` : retrait du trait de chaque côté de l'onglet (px). Un seul
 * abonnement `matchMedia` par montage.
 */
export function useSlideIndicator(
  list: RefObject<HTMLElement | null>,
  bar: RefObject<HTMLElement | null>,
  selector: string,
  deps: unknown[] = [],
  { inset = 0 }: { inset?: number; rounded?: boolean } = {},
) {
  const placed = useRef<{ x: number; w: number } | null>(null);
  useIsoLayoutEffect(() => {
    const root = list.current;
    const line = bar.current;
    if (!root || !line) return;
    const reduce = window.matchMedia(NO_MOTION);
    let anim: Animation | null = null;
    const place = (animate: boolean) => {
      const active = root.querySelector<HTMLElement>(selector);
      if (!active) {
        line.style.visibility = "hidden";
        line.style.opacity = "0";
        placed.current = null;
        return;
      }
      const x = active.offsetLeft + inset;
      const w = Math.max(0, active.offsetWidth - 2 * inset);
      const was = placed.current;
      if (was && was.x === x && was.w === w) return;
      line.style.width = `${w}px`;
      line.style.transform = `translateX(${x}px)`;
      line.style.visibility = "visible";
      line.style.opacity = "1";
      anim?.cancel();
      anim = null;
      if (animate && was && w > 0 && !reduce.matches) {
        line.style.willChange = "transform";
        anim = line.animate(
          [
            { transform: `translateX(${was.x}px) scaleX(${was.w / w})` },
            { transform: `translateX(${x}px) scaleX(1)` },
          ],
          { duration: MOTION.panel * 1000, easing: EASE.hud },
        );
        anim.onfinish = anim.oncancel = () => {
          line.style.willChange = "";
        };
      }
      placed.current = { x, w };
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
      anim?.cancel();
    };
    // `deps` : recalcul voulu par l'appelant (onglets visibles qui changent).
  }, [selector, inset, ...deps]);
}

function rgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex.trim());
  if (!m) return `rgba(127, 127, 127, ${alpha})`;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h ?? "0", 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const running = new WeakMap<HTMLElement, Animation>();

/**
 * Primitive `highlight` : une donnée arrivée ou modifiée en direct est signalée par un fond `info` qui s'estompe en
 * 1,2 s (DESIGN-DIRECTION § Motion). En mouvement réduit : fond fixe 1,2 s, sans transition. Un nouveau signal sur la
 * même ligne remplace le précédent ; à la fin, le fond de la feuille de style reprend (rien ne reste en style en ligne).
 */
export function highlightElements(els: HTMLElement[]) {
  if (!els.length) return;
  const info = getComputedStyle(document.documentElement).getPropertyValue("--info");
  const from = rgba(info, 0.22);
  if (reducedMotion()) {
    for (const el of els) el.style.backgroundColor = from;
    window.setTimeout(() => {
      for (const el of els) el.style.backgroundColor = "";
    }, MOTION.highlight * 1000);
    return;
  }
  for (const el of els) {
    running.get(el)?.cancel();
    const a = el.animate([{ backgroundColor: from }, { backgroundColor: rgba(info, 0) }], {
      duration: MOTION.highlight * 1000,
      // power1.out
      easing: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
    });
    running.set(el, a);
    a.onfinish = () => running.delete(el);
  }
}

/**
 * Continuité ligne → panneau (étape 7, lot 4) : un cadre fantôme (contour accent) part du rectangle de la ligne cliquée et
 * rejoint celui du panneau qui s'ouvre, puis s'efface (≈ 380 ms). Le cadre est posé à sa place finale et seul `transform`
 * (FLIP) puis `opacity` sont animés. Rien en mouvement réduit. Aucun nœud ne reste dans le DOM.
 */
export function ghostFlip(
  from: DOMRect,
  to: { left: number; top: number; width: number; height: number },
) {
  if (typeof window === "undefined" || reducedMotion()) return;
  if (from.width < 4 || from.height < 4 || to.width < 4 || to.height < 4) return;
  const ghost = document.createElement("div");
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${to.left}px`,
    top: `${to.top}px`,
    width: `${to.width}px`,
    height: `${to.height}px`,
    border: "2px solid var(--accent)",
    background: "color-mix(in oklab, var(--accent) 8%, transparent)",
    borderRadius: "var(--r-box, 0px)",
    zIndex: "60",
    pointerEvents: "none",
    transformOrigin: "0 0",
    willChange: "transform, opacity",
  });
  document.body.appendChild(ghost);
  const sx = from.width / to.width;
  const sy = from.height / to.height;
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  // 260 ms de trajet (power3.inOut), puis 120 ms de fondu : courbe par image clé.
  const anim = ghost.animate(
    [
      {
        transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
        opacity: 1,
        offset: 0,
        easing: "cubic-bezier(0.65, 0, 0.35, 1)",
      },
      { transform: "none", opacity: 1, offset: 0.68, easing: "ease-out" },
      { transform: "none", opacity: 0, offset: 1 },
    ],
    { duration: 380 },
  );
  const remove = () => ghost.remove();
  anim.onfinish = remove;
  anim.oncancel = remove;
}

/**
 * Entrée « depuis » un état (équivalent de `gsap.from`, sans GSAP) : chaque élément part de `from` et revient à son
 * style calculé (image clé de fin implicite), en cascade de `stagger` ms bornée à `maxDelay`. État de départ appliqué
 * pendant le délai (`fill: backwards`), rien ne reste en style à la fin. Rien en mouvement réduit. Renvoie l'annulation.
 */
export function animateFrom(
  els: Iterable<Element>,
  from: Keyframe,
  {
    duration,
    delay = 0,
    stagger = 0,
    maxDelay = Infinity,
    easing = EASE.hud,
  }: { duration: number; delay?: number; stagger?: number; maxDelay?: number; easing?: string },
): () => void {
  const list = [...els];
  if (!list.length || reducedMotion()) return () => {};
  const anims = list.map((el, i) =>
    el.animate([{ ...from, offset: 0 }], {
      duration,
      delay: Math.min(maxDelay, delay + i * stagger),
      easing,
      fill: "backwards",
    }),
  );
  return () => anims.forEach((a) => a.cancel());
}
