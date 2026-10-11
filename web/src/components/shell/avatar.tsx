import { cn } from "@/lib/utils";

import { initials } from "./types";

/**
 * Bordure de l'avatar selon le rôle (demande du 11 oct. 2026) : anneau neutre du thème pour tous, anneau d'accent doublé
 * pour les administrateurs et sysops (repérables d'un coup d'œil dans le Journal, l'équipe, la présence en ligne).
 */
export function avatarRing(role?: string): string {
  return role === "admin" || role === "sysop"
    ? "ring-2 ring-accent ring-offset-2 ring-offset-surface"
    : "ring-1 ring-border-strong ring-offset-1 ring-offset-surface";
}

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
  role,
  className,
}: {
  name: string;
  email: string;
  /** Identifiant et nom du fichier d'avatar : la photo n'est affichée que si les deux sont connus. */
  id?: string;
  avatar?: string;
  large?: boolean;
  /** Rôle du compte : bordure distincte pour les administrateurs et sysops. */
  role?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center overflow-hidden bg-surface-2 font-mono text-small font-medium text-fg",
        avatarRing(role),
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
