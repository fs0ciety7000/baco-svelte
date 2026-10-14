// Rôles (lot L3, 14 oct. 2026, docs/design/CADRAGE-ROLES-V3.md §2.4) : libellés, couleurs et permissions lus dans la
// collection PocketBase `roles` (server/data/roles.ts). Module isomorphe (client et serveur) ; `DEFAULT_ROLES` = copie des
// rôles système insérés par la migration 1760004500, repli quand la collection est absente ou illisible.

import { CATALOG_KEYS, roleDefaults } from "./permissions/catalog";

export const ROLE_COLORS = ["accent", "info", "ok", "warn", "progress", "neutral"] as const;
export type RoleColor = (typeof ROLE_COLORS)[number];

export const ROLE_COLOR_LABEL: Record<RoleColor, string> = {
  accent: "Accent",
  info: "Bleu",
  ok: "Vert",
  warn: "Ambre",
  progress: "Violet",
  neutral: "Neutre",
};

export type RoleMeta = {
  key: string;
  label: string;
  description: string;
  color: RoleColor;
  /** Permissions du rôle (clés du catalogue ; admin / sysop : tout). */
  perms: string[];
  system: boolean;
  locked: boolean;
  sort: number;
  /** Rôle d'origine d'un rôle créé (« créé à partir de PACO/RCCA »). */
  basedOn: string;
};

/** Rôles système qui ne s'attribuent pas depuis la fiche d'un agent (désactivation à part, compte de service). */
export const NON_ASSIGNABLE = ["disabled", "connector"];

/** Rôles « tout » : anneau d'avatar doublé, droits complets testés en dur par les règles. */
export const FULL_ROLE_KEYS = ["admin", "sysop"];

function sys(
  key: string,
  label: string,
  description: string,
  color: RoleColor,
  locked: boolean,
  sort: number,
): RoleMeta {
  return {
    key,
    label,
    description,
    color,
    perms: roleDefaults(key),
    system: true,
    locked,
    sort,
    basedOn: "",
  };
}

export const DEFAULT_ROLES: RoleMeta[] = [
  sys("admin", "Administrateur", "Tous les droits, administration comprise.", "accent", true, 10),
  sys(
    "sysop",
    "Sysop",
    "Tous les droits, administration comprise (exploitation technique).",
    "accent",
    true,
    20,
  ),
  sys(
    "moderator",
    "Modérateur",
    "PACO/RCCA, plus la suppression, la modération du Journal et les annonces.",
    "neutral",
    false,
    30,
  ),
  sys(
    "paco",
    "PACO/RCCA",
    "Lecture partout, création et modification, sans suppression.",
    "neutral",
    false,
    40,
  ),
  sys("guest", "Invité", "Lecture des bons bus et taxi.", "neutral", false, 50),
  sys("screen", "Écran", "Poste partagé : l'écran commun /tv seulement.", "neutral", true, 60),
  sys(
    "connector",
    "Connecteur",
    "Compte de service (extension DICOS, Quinyx).",
    "neutral",
    true,
    70,
  ),
  sys("disabled", "Désactivé", "Compte désactivé : aucune connexion.", "neutral", true, 80),
];

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Fiche `roles` (PocketBase) → RoleMeta ; couleur inconnue = neutre, permissions limitées au catalogue. */
export function roleFromRecord(r: Record<string, unknown>): RoleMeta {
  const key = str(r.key);
  const color = (ROLE_COLORS as readonly string[]).includes(str(r.color))
    ? (str(r.color) as RoleColor)
    : "neutral";
  const known = new Set(CATALOG_KEYS);
  const perms = Array.isArray(r.perms)
    ? r.perms.filter((k): k is string => typeof k === "string" && known.has(k))
    : [];
  return {
    key,
    label: str(r.label) || key,
    description: str(r.description),
    color,
    perms: FULL_ROLE_KEYS.includes(key) ? [...CATALOG_KEYS] : perms,
    system: r.system === true,
    locked: r.locked === true,
    sort: typeof r.sort === "number" ? r.sort : 0,
    basedOn: str(r.based_on),
  };
}

export function roleMeta(key: string, roles: RoleMeta[] = DEFAULT_ROLES): RoleMeta | undefined {
  return roles.find((r) => r.key === key) ?? DEFAULT_ROLES.find((r) => r.key === key);
}

/** Libellé d'un rôle (identifiant s'il est inconnu). */
export function roleLabel(key: string, roles: RoleMeta[] = DEFAULT_ROLES): string {
  return roleMeta(key, roles)?.label ?? key;
}

const RING: Record<RoleColor, string> = {
  accent: "ring-accent",
  info: "ring-info",
  ok: "ring-ok",
  warn: "ring-warn",
  progress: "ring-progress",
  neutral: "ring-border-strong",
};

/**
 * Bordure de l'avatar selon le rôle (11 oct. 2026 ; couleur du rôle depuis le lot L3) : anneau fin de la couleur du rôle
 * (neutre par défaut), anneau doublé pour les administrateurs et sysops (repérables d'un coup d'œil).
 */
export function avatarRing(role?: string, roles: RoleMeta[] = DEFAULT_ROLES): string {
  const meta = role ? roleMeta(role, roles) : undefined;
  const ring = RING[meta?.color ?? "neutral"];
  if (role && FULL_ROLE_KEYS.includes(role))
    return `ring-2 ${ring} ring-offset-2 ring-offset-surface`;
  return meta && meta.color !== "neutral"
    ? `ring-2 ${ring} ring-offset-1 ring-offset-surface`
    : "ring-1 ring-border-strong ring-offset-1 ring-offset-surface";
}

/** Rôles proposés dans la fiche d'un agent et la création de compte (ordre d'affichage). */
export function assignableRoles(roles: RoleMeta[]): RoleMeta[] {
  return [...roles]
    .filter((r) => !NON_ASSIGNABLE.includes(r.key))
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, "fr"));
}
