"use client";

import type { gsap as Gsap } from "gsap";
import { useEffect, useRef, useState } from "react";

import { NO_MOTION } from "@/lib/motion-core";

type GsapApi = typeof Gsap;
// GSAP chargé à la demande (lot 5) : l'emblème est dans le pied de page de chaque écran, GSAP ne doit pas peser sur le
// bundle initial. Chargé seulement quand l'emblème devient visible ou au premier survol.
let gsapPromise: Promise<GsapApi> | null = null;
const loadGsap = () => (gsapPromise ??= import("gsap").then((m) => m.gsap as GsapApi));

// Emblèmes animés de l'éditeur (charte CARDOR Media, https://cardormedia.com/marque) : le Dragon de CM Interactive
// (« glitch ») et la roue du Car d'Or (un tour, le noyau bat). Repris du site cardormedia.com (Logo.svelte /
// emblem-motion.ts) : le SVG détaillé est chargé puis inséré tel quel (fichier statique du domaine CSM, sans script),
// chaque forme est enveloppée pour être animée sans perdre sa position. Monochrome au repos, couleurs de la marque au
// survol du conteneur `[data-brand-host]` (globals.css) ; aucune animation en mouvement réduit.

type MarkName = "occ-interactive" | "cardor-monogram";

const RATIO: Record<MarkName, number> = { "occ-interactive": 770 / 625, "cardor-monogram": 1 };
const SVG_NS = "http://www.w3.org/2000/svg";
const cache = new Map<MarkName, Promise<string>>();

function loadMark(name: MarkName): Promise<string> {
  let p = cache.get(name);
  if (!p) {
    p = fetch(`/brand/${name}.svg`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((txt) => {
        const doc = new DOMParser().parseFromString(txt, "image/svg+xml");
        const svg = doc.documentElement;
        if (svg.nodeName !== "svg" || svg.querySelector("script, foreignObject"))
          throw new Error("svg");
        doc.querySelectorAll("path, circle").forEach((shape) => {
          const outer = doc.createElementNS(SVG_NS, "g");
          const inner = doc.createElementNS(SVG_NS, "g");
          inner.setAttribute("class", "part");
          const t = shape.getAttribute("transform");
          if (t) {
            outer.setAttribute("transform", t);
            shape.removeAttribute("transform");
          }
          shape.replaceWith(outer);
          outer.appendChild(inner);
          inner.appendChild(shape);
        });
        const root = doc.createElementNS(SVG_NS, "g");
        root.setAttribute("data-root", "");
        while (svg.firstChild) root.appendChild(svg.firstChild);
        svg.appendChild(root);
        svg.removeAttribute("role");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        return svg.outerHTML;
      });
    p.catch(() => cache.delete(name));
    cache.set(name, p);
  }
  return p;
}

function glitch(gsap: GsapApi, svg: SVGSVGElement, root: SVGGElement) {
  const { x: vx, y: vy, width: vw, height: vh } = svg.viewBox.baseVal;
  const t2 = root.querySelector<SVGGElement>(".t2");
  const facets = [...root.querySelectorAll<SVGGElement>(".t2 .part")];
  const ghost = t2?.cloneNode(true) as SVGGElement | undefined;
  if (ghost && t2) {
    ghost.removeAttribute("class");
    ghost.setAttribute("fill", "#ff2bd6");
    ghost.setAttribute("style", "mix-blend-mode:screen;opacity:0");
    t2.after(ghost);
  }
  const origin = `${vx + vw / 2} ${vy + vh / 2}`;
  const build = () => {
    const u = vw / (svg.getBoundingClientRect().width || vw); // unités SVG par pixel écran
    const jump = () => gsap.utils.snap(u, gsap.utils.random(-1, 1) * Math.max(0.05 * vw, 6 * u));
    return gsap
      .timeline()
      .to(
        root,
        { skewX: -10, duration: 0.24, ease: "steps(3)", yoyo: true, repeat: 1, svgOrigin: origin },
        0,
      )
      .to(
        facets,
        {
          x: jump,
          y: jump,
          duration: 0.06,
          ease: "none",
          stagger: { each: 0.01, from: "random" },
          repeat: 4,
          repeatRefresh: true,
        },
        0,
      )
      .to(
        ghost ?? [],
        {
          keyframes: [
            { opacity: 0.7, x: 4 * u },
            { opacity: 0, x: -3 * u },
            { opacity: 0.55, x: 2 * u },
            { opacity: 0, x: 0 },
          ],
          duration: 0.36,
          ease: "steps(1)",
        },
        0.04,
      )
      .to(facets, { x: 0, y: 0, duration: 0.18, ease: "power3.out" });
  };
  // Première apparition : « boot » glitch (facettes allumées au hasard, cisaillement en paliers).
  const reveal = () => {
    const parts = [...root.querySelectorAll<SVGGElement>(".part")];
    gsap.set(parts, { autoAlpha: 0 });
    return gsap
      .timeline()
      .to(parts, {
        autoAlpha: 1,
        duration: 0.01,
        ease: "none",
        stagger: { each: 0.012, from: "random" },
      })
      .fromTo(
        root,
        { skewX: -12 },
        { skewX: 0, duration: 0.5, ease: "steps(5)", svgOrigin: origin },
        0,
      );
  };
  return { build, reveal };
}

function spin(gsap: GsapApi, root: SVGGElement) {
  const core = root.querySelectorAll(".t3 .part");
  const build = () =>
    gsap
      .timeline()
      .to(root, { rotation: "+=360", duration: 1.6, ease: "power3.out", svgOrigin: "50 50" }, 0)
      .to(core, { scale: 1.6, duration: 0.2, ease: "power3.out", svgOrigin: "50 50" }, 0.15)
      .to(core, { scale: 1, duration: 0.9, ease: "elastic.out(1, 0.4)", svgOrigin: "50 50" }, 0.35);
  return { build, reveal: build };
}

export function BrandMark({ name, className }: { name: MarkName; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [markup, setMarkup] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadMark(name)
      .then((m) => alive && setMarkup(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [name]);

  useEffect(() => {
    const el = ref.current;
    const svg = el?.querySelector("svg");
    const root = svg?.querySelector<SVGGElement>("g[data-root]");
    if (!el || !svg || !root || window.matchMedia(NO_MOTION).matches) return;
    type Motion = { build: () => gsap.core.Timeline; reveal: () => gsap.core.Timeline };
    let motion: Motion | null = null;
    let current: gsap.core.Timeline | null = null;
    let alive = true;
    const ready = () =>
      loadGsap().then((gsap) => {
        if (alive && !motion)
          motion = name === "occ-interactive" ? glitch(gsap, svg, root) : spin(gsap, root);
        return alive ? motion : null;
      });
    const play = () => {
      if (current?.isActive() || document.hidden) return;
      void ready().then((m) => {
        if (!m || current?.isActive()) return;
        current?.kill();
        current = m.build();
      });
    };
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      void ready().then((m) => {
        if (m) current = m.reveal();
      });
    });
    io.observe(el);
    const host = el.closest<HTMLElement>("[data-brand-host]") ?? el.parentElement;
    host?.addEventListener("pointerenter", play);
    host?.addEventListener("focusin", play);
    return () => {
      alive = false;
      io.disconnect();
      host?.removeEventListener("pointerenter", play);
      host?.removeEventListener("focusin", play);
      current?.kill();
    };
  }, [markup, name]);

  return (
    <span
      ref={ref}
      data-mark={name}
      aria-hidden
      className={`brand-mark inline-block shrink-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full ${className ?? ""}`}
      style={{ aspectRatio: RATIO[name] }}
      // Fichier statique du domaine CSM (public/brand), sans script ni foreignObject (vérifié au chargement).
      dangerouslySetInnerHTML={markup ? { __html: markup } : undefined}
    />
  );
}
