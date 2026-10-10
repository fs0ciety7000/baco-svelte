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
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrateur",
  sysop: "SysOp",
  moderator: "Coordinateur",
  otto_agent: "Agent C3",
  user: "Agent",
  reader: "Lecture seule",
  disabled: "Désactivé",
};

export function initials(name: string, email: string): string {
  const source = name.trim() || email.split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters =
    parts.length > 1 ? `${parts[0]![0]}${parts[parts.length - 1]![0]}` : source.slice(0, 2);
  return letters.toUpperCase();
}
