"use client";

import { avatarRing as ringFor } from "@/lib/roles";
import { cn } from "@/lib/utils";

import { useRoles } from "./roles-context";
import { initials } from "./types";

/**
 * Bordure de l'avatar selon le rôle (11 oct. 2026 ; couleur du rôle lue dans `roles` depuis le lot L3) : anneau fin de
 * la couleur du rôle (neutre par défaut), anneau doublé pour les administrateurs et sysops.
 */
export function useAvatarRing(): (role?: string) => string {
  const roles = useRoles();
  return (role?: string) => ringFor(role, roles);
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
  /** Rôle du compte : bordure de la couleur du rôle, doublée pour les administrateurs et sysops. */
  role?: string;
  className?: string;
}) {
  const ring = useAvatarRing();
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center overflow-hidden bg-surface-2 font-mono text-small font-medium text-fg",
        ring(role),
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
