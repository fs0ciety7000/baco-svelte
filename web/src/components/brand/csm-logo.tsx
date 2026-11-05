import { cn } from "@/lib/utils";

/**
 * Logo CSM « Correspondance · Encre et sable » (identité du 4 nov. 2026, dépôt csm-brand, charte brand/csm/kit/C) :
 * deux lignes décalées (le train, le bus) reliées par un passage sable qui dessine le S. Tracés repris des fichiers
 * maîtres de la charte (police Onest vectorisée, licence OFL) : ne pas les redessiner.
 *
 * Couleurs : lignes et logotype en `--fg` (encre le jour, ivoire la nuit), passage en `--brand-sable` (fixe). `animate` :
 * le point de correspondance parcourt le symbole une fois ; `animate="loop"` (version animée de la charte, barre latérale et
 * barre du haut mobile, 5 nov. 2026) : il repart en boucle, avec une pause entre deux passages (CSS `.csm-logo-dot`, rien en
 * mouvement réduit).
 */
const SYMBOL_LINES =
  "M16 66L40 66L40 76C40 81.523 44.477 86 50 86C55.523 86 60 81.523 60 76L60 67.999C62.429 69.824 64 72.728 64 76C64 81.523 59.523 86 54 86L16 86C10.477 86 6 81.523 6 76C6 70.477 10.477 66 16 66ZM50 14L84 14C89.523 14 94 18.477 94 24C94 29.523 89.523 34 84 34L60 34L60 24C60 18.477 55.523 14 50 14ZM46 14L50 14C44.477 14 40 18.477 40 24L40 32.001C37.571 30.176 36 27.272 36 24C36 18.477 40.477 14 46 14Z";
const SYMBOL_PASSAGE =
  "M50 14L50 14C55.523 14 60 18.477 60 24L60 76C60 81.523 55.523 86 50 86L50 86C44.477 86 40 81.523 40 76L40 24C40 18.477 44.477 14 50 14Z";
const LOCKUP_LINES =
  "M-192.973 77.778L-151.306 77.778L-151.306 95.139C-151.306 104.727 -143.533 112.5 -133.945 112.5C-124.356 112.5 -116.584 104.727 -116.584 95.139L-116.584 81.248C-112.367 84.417 -109.639 89.458 -109.639 95.139C-109.639 104.727 -117.412 112.5 -127 112.5L-192.973 112.5C-202.561 112.5 -210.334 104.727 -210.334 95.139C-210.334 85.55 -202.561 77.778 -192.973 77.778ZM-133.945 -12.5L-74.917 -12.5C-65.329 -12.5 -57.556 -4.727 -57.556 4.861C-57.556 14.45 -65.329 22.222 -74.917 22.222L-116.584 22.222L-116.584 4.861C-116.584 -4.727 -124.356 -12.5 -133.945 -12.5ZM-140.889 -12.5L-133.945 -12.5C-143.533 -12.5 -151.306 -4.727 -151.306 4.861L-151.306 18.752C-155.523 15.583 -158.25 10.542 -158.25 4.861C-158.25 -4.727 -150.478 -12.5 -140.889 -12.5Z";
const LOCKUP_PASSAGE =
  "M-133.945 -12.5L-133.945 -12.5C-124.356 -12.5 -116.584 -4.727 -116.584 4.861L-116.584 95.139C-116.584 104.727 -124.356 112.5 -133.945 112.5L-133.945 112.5C-143.533 112.5 -151.306 104.727 -151.306 95.139L-151.306 4.861C-151.306 -4.727 -143.533 -12.5 -133.945 -12.5Z";
const LOCKUP_WORDMARK =
  "M155.367 100L155.367 25.565L173.164 25.565L174.859 33.898Q177.684 29.944 181.144 27.895Q184.605 25.847 188.136 25.141Q191.667 24.435 194.633 24.435Q201.271 24.435 206.356 26.977Q211.441 29.52 214.548 35.169Q217.514 31.073 221.045 28.743Q224.576 26.412 228.531 25.424Q232.486 24.435 236.582 24.435Q245.198 24.435 250.494 28.037Q255.791 31.638 258.263 37.994Q260.734 44.35 260.734 52.825L260.734 100L240.96 100L240.96 58.051Q240.96 55.508 240.678 52.825Q240.395 50.141 239.336 47.74Q238.277 45.339 236.229 43.785Q234.181 42.232 230.508 42.232Q226.977 42.232 224.576 43.785Q222.175 45.339 220.763 47.952Q219.35 50.565 218.715 53.602Q218.079 56.638 218.079 59.746L218.079 100L198.305 100L198.305 57.91Q198.305 55.508 198.023 52.825Q197.74 50.141 196.751 47.74Q195.763 45.339 193.573 43.785Q191.384 42.232 187.571 42.232Q182.345 42.232 179.59 45.268Q176.836 48.305 175.989 52.472Q175.141 56.638 175.141 60.169L175.141 100ZM114.124 100.989Q108.898 100.989 103.39 99.859Q97.881 98.729 93.22 95.975Q88.559 93.22 85.311 88.489Q82.062 83.757 81.073 76.695L101.13 76.695Q101.977 79.237 104.167 81.073Q106.356 82.91 109.251 83.757Q112.147 84.605 115.113 84.605Q117.09 84.605 119.068 84.322Q121.045 84.04 122.74 83.192Q124.435 82.345 125.424 81.003Q126.412 79.661 126.412 77.542Q126.412 75.424 125.212 74.153Q124.011 72.881 121.893 72.105Q119.774 71.328 116.808 70.763Q113.842 70.056 110.593 69.492Q107.345 68.927 104.237 68.22Q98.87 66.808 94.068 64.477Q89.266 62.147 86.229 57.91Q83.192 53.672 83.192 46.751Q83.192 40.678 85.805 36.37Q88.418 32.062 92.797 29.379Q97.175 26.695 102.542 25.494Q107.91 24.294 113.559 24.294Q121.186 24.294 127.684 26.766Q134.181 29.237 138.418 34.393Q142.655 39.548 143.644 47.74L124.718 47.74Q124.153 44.633 120.904 42.655Q117.655 40.678 112.853 40.678Q111.158 40.678 109.251 41.031Q107.345 41.384 105.791 42.09Q104.237 42.797 103.249 43.997Q102.26 45.198 102.26 47.175Q102.26 48.729 103.178 50Q104.096 51.271 105.932 52.189Q107.768 53.107 110.311 53.672Q114.831 54.661 119.774 55.579Q124.718 56.497 128.531 57.627Q133.192 58.757 137.076 60.946Q140.96 63.136 143.432 67.02Q145.904 70.904 145.904 77.119Q145.904 84.181 143.079 88.771Q140.254 93.362 135.523 96.045Q130.791 98.729 125.212 99.859Q119.633 100.989 114.124 100.989ZM40.96 100.989Q29.52 100.989 21.469 96.328Q13.418 91.667 9.181 83.121Q4.944 74.576 4.944 62.994Q4.944 51.271 9.322 42.585Q13.701 33.898 21.963 29.096Q30.226 24.294 41.667 24.294Q50.847 24.294 57.91 27.542Q64.972 30.791 69.35 36.864Q73.729 42.938 74.435 51.836L55.085 51.836Q53.814 46.893 50.212 44.562Q46.61 42.232 41.667 42.232Q35.311 42.232 31.568 45.339Q27.825 48.446 26.201 53.249Q24.576 58.051 24.576 62.853Q24.576 68.079 26.271 72.74Q27.966 77.401 31.709 80.297Q35.452 83.192 41.525 83.192Q46.61 83.192 50.424 80.862Q54.237 78.531 55.367 73.588L75.141 73.588Q74.435 82.768 69.633 88.842Q64.831 94.915 57.345 97.952Q49.859 100.989 40.96 100.989Z";

function Dot({ path, r }: { path: string; r: number }) {
  return (
    <circle aria-hidden className="csm-logo-dot" r={r} style={{ offsetPath: `path("${path}")` }} />
  );
}

/** Symbole seul (barre latérale réduite, icônes, petits formats). */
export function CsmSymbol({
  className,
  animate = false,
  decorative = false,
}: {
  className?: string;
  animate?: boolean | "loop";
  /** Dans un lien déjà nommé (« CSM, accueil ») : masqué aux lecteurs d'écran. */
  decorative?: boolean;
}) {
  return (
    <svg
      viewBox="6 14 88 72"
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "CSM"}
      aria-hidden={decorative || undefined}
      className={cn(
        "csm-logo overflow-visible",
        animate && "csm-logo-play",
        animate === "loop" && "csm-logo-loop",
        className,
      )}
    >
      <path d={SYMBOL_LINES} fill="var(--brand-line, var(--fg))" />
      <path d={SYMBOL_PASSAGE} fill="var(--brand-sable)" />
      {animate ? <Dot path="M90 24 L50 24 L50 76 L10 76" r={5.6} /> : null}
    </svg>
  );
}

/** Logo complet : symbole + logotype « csm ». */
export function CsmLogo({
  className,
  animate = false,
  decorative = false,
}: {
  className?: string;
  animate?: boolean | "loop";
  /** Dans un lien déjà nommé (« CSM, accueil ») : masqué aux lecteurs d'écran. */
  decorative?: boolean;
}) {
  return (
    <svg
      viewBox="-210.334 -12.5 471.068 125"
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "CSM"}
      aria-hidden={decorative || undefined}
      className={cn(
        "csm-logo overflow-visible",
        animate && "csm-logo-play",
        animate === "loop" && "csm-logo-loop",
        className,
      )}
    >
      <path d={LOCKUP_LINES} fill="var(--brand-line, var(--fg))" />
      <path d={LOCKUP_PASSAGE} fill="var(--brand-sable)" />
      <path d={LOCKUP_WORDMARK} fill="var(--brand-line, var(--fg))" />
      {animate ? <Dot path="M-64.5 4.9 L-133.9 4.9 L-133.9 95.1 L-203.4 95.1" r={9.7} /> : null}
    </svg>
  );
}
