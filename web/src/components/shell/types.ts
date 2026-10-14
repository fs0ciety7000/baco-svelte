import type { Role } from "@/lib/permissions";

/** Agent connecté, tel que transmis aux composants client du shell (aucune donnée sensible). */
export type ShellUser = {
  id: string;
  name: string;
  email: string;
  /** Nom du fichier d'avatar (vide = initiales). */
  avatar: string;
  role: Role;
  grants: string[];
  denies: string[];
  /** Permissions effectives (`users.perms`) ; null = ancien calcul (voir `can()`). */
  perms: string[] | null;
  /** Districts du jour (puce de la barre du haut) ; null = l'agent ne lit pas le Journal (pas de puce). */
  duty?: {
    districts: string[];
    today: boolean;
    /** Proposition d'après la prestation Quinyx du jour (l'agent garde la main). */
    suggested?: { districts: string[]; label: string } | null;
  } | null;
};

export function initials(name: string, email: string): string {
  const source = name.trim() || email.split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters =
    parts.length > 1 ? `${parts[0]![0]}${parts[parts.length - 1]![0]}` : source.slice(0, 2);
  return letters.toUpperCase();
}
