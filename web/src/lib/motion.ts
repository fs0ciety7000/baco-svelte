"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";

// GSAP de CSM (DESIGN-DIRECTION.md § Motion) : réservé aux mises en scène propres à une page (frise « Ma journée »,
// écran commun, intro de connexion, repère « maintenant » des missions), toujours par gsap.matchMedia() pour respecter
// prefers-reduced-motion. **Ne jamais importer ce module depuis le shell ni depuis `components/ui`** : il ajoute GSAP
// (≈ 40 Ko compressés) au bundle de la page. Les primitives communes (arrivée de page, cascade, trait d'onglet,
// `highlight`, continuité ligne → panneau) vivent dans `@/lib/motion-core`, sans GSAP (lot 5, 15 oct. 2026) ; elles sont
// réexportées ici pour les anciens imports.

gsap.registerPlugin(useGSAP, CustomEase);
CustomEase.create("hud", "0.2, 0, 0, 1");

export {
  CASCADE,
  EASE,
  ghostFlip,
  highlightElements,
  MOTION,
  MOTION_OK,
  NO_MOTION,
  playEnter,
  useSlideIndicator,
  useStaggerIn,
} from "./motion-core";
export { gsap, useGSAP };
