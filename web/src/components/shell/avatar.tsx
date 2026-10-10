import { cn } from "@/lib/utils";

import { initials } from "./types";

/**
 * Avatar : photo du profil si l'agent en a déposé une (servie par `/api/avatar/<id>`, fichier protégé), sinon initiales
 * (pas de service externe : DiceBear est remplacé, décision du 8 octobre 2026).
 */
export function Avatar({
  name,
  email,
  id,
  avatar,
  large,
  className,
}: {
  name: string;
  email: string;
  /** Identifiant et nom du fichier d'avatar : la photo n'est affichée que si les deux sont connus. */
  id?: string;
  avatar?: string;
  large?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center overflow-hidden border border-border-strong bg-surface-2 font-mono text-small font-medium text-fg",
        className,
      )}
    >
      {id && avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/avatar/${id}?v=${encodeURIComponent(avatar)}${large ? "&t=256" : ""}`}
          alt=""
          className="size-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        initials(name, email)
      )}
    </span>
  );
}
