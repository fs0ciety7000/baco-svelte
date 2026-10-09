import Image from "next/image";

import { cn } from "@/lib/utils";

/** Mention de l'éditeur avec son logo (pied de page du shell et de la page de connexion). */
export function StudioCredit({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-small text-fg-muted",
        className,
      )}
    >
      <a
        href="https://studios.fs0ciety.org/"
        target="_blank"
        rel="noopener noreferrer"
        aria-hidden
        tabIndex={-1}
        className="shrink-0"
      >
        <Image
          src="/brand/occ-mons-studios.webp"
          alt=""
          width={19}
          height={32}
          unoptimized
          className="h-8 w-auto"
        />
      </a>
      Développé par{" "}
      <a
        href="https://studios.fs0ciety.org/"
        target="_blank"
        rel="noopener noreferrer"
        className="link"
      >
        OCC MONS Studios
      </a>{" "}
      · {new Date().getFullYear()}
    </p>
  );
}
