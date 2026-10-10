import { cn } from "@/lib/utils";

import { BrandMark } from "./brand-mark";

/**
 * Mention de l'éditeur (pied de page du shell et des pages de connexion) : OCC Interactive, division de CARDOR Media,
 * avec ses emblèmes animés (Dragon et roue du Car d'Or, charte https://cardormedia.com/marque).
 */
export function StudioCredit({ className }: { className?: string }) {
  return (
    <p
      data-brand-host
      className={cn(
        "inline-flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-small text-fg-muted md:justify-start",
        className,
      )}
    >
      <a
        href="https://interactive.cardormedia.com/"
        target="_blank"
        rel="noopener noreferrer"
        aria-hidden
        tabIndex={-1}
        className="shrink-0"
      >
        <BrandMark name="occ-interactive" className="h-8" />
      </a>
      Développé par{" "}
      <a
        href="https://interactive.cardormedia.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="link"
      >
        OCC Interactive
      </a>
      <span>· une division de</span>
      <a
        href="https://cardormedia.com/marque"
        target="_blank"
        rel="noopener noreferrer"
        className="link inline-flex items-center gap-1"
      >
        <BrandMark name="cardor-monogram" className="h-4" />
        CARDOR Media
      </a>{" "}
      · {new Date().getFullYear()}
    </p>
  );
}
