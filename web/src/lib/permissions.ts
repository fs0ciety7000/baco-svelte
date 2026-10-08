// Permissions CSM, reprises de la v1 (src/lib/permissions.js) : rôle par défaut + grants / denies par agent.
// Le contrôle réel est fait par les règles PocketBase ; ce module sert à l'affichage (menus, boutons).

export type Role = "admin" | "sysop" | "moderator" | "otto_agent" | "user" | "reader" | "disabled";

const READ_ALL = [
  "planning:read",
  "journal:read",
  "documents:read",
  "repertoire:read",
  "bus:read",
  "taxi:read",
  "otto:read",
  "ptcar:read",
  "b201:read",
  "ebp:read",
  "ops:read",
  "carte_pn:read",
  "pmr:read",
  "generate_taxi:read",
  "stats:read",
  "deplacements:read",
  "live:read",
];

const ROLE_DEFAULTS: Record<Role, string[]> = {
  admin: ["*"],
  sysop: ["*"],
  // b201:read : la remise B201 est écrite par tous les agents du district (décision du 8 octobre 2026).
  otto_agent: ["otto:read", "otto:write", "stats:read", "b201:read"],
  moderator: [
    ...READ_ALL,
    "users:manage",
    "planning:write",
    "journal:write",
    "documents:write",
    "repertoire:write",
    "bus:write",
    "taxi:write",
    "otto:write",
    "ptcar:write",
    "b201:write", // B201 : la règle réelle est canWriteB201 (agents rattachés à un district)
    "ebp:write",
    "ops:write",
    "carte_pn:write",
    "pmr:write",
    "generate_taxi:write",
    "lignes:read",
    "lignes:write",
    "deplacements:write",
  ],
  user: [
    ...READ_ALL,
    "planning:write",
    "journal:write",
    "documents:write",
    "bus:write",
    "taxi:write",
    "otto:write",
    "ops:write",
    "generate_taxi:write",
    "pmr:write",
    "deplacements:write",
  ],
  reader: READ_ALL,
  disabled: [],
};

export type PermissionSubject = { role: Role; grants?: string[] | null; denies?: string[] | null };

export function can(user: PermissionSubject | null | undefined, permission: string): boolean {
  if (!user || user.role === "disabled") return false;
  if (user.role === "admin" || user.role === "sysop") return true;
  if (user.grants?.includes(permission)) return true;
  if (user.denies?.includes(permission)) return false;
  return ROLE_DEFAULTS[user.role].includes(permission);
}

/**
 * Remise B201 (décision du 8 octobre 2026) : écrite par tout agent (user) rattaché à un district, par les moderators,
 * par un admin, ou sur permission accordée. Miroir de la règle PocketBase `1760000300`.
 */
export function canWriteB201(
  user: (PermissionSubject & { district?: string | null }) | null | undefined,
): boolean {
  if (!user || user.role === "disabled") return false;
  if (user.role === "admin" || user.role === "sysop") return true;
  if (user.grants?.includes("b201:write")) return true;
  if (user.denies?.includes("b201:write")) return false;
  return (
    user.role === "moderator" ||
    ((user.role === "user" || user.role === "otto_agent") && !!user.district)
  );
}

export function isAdmin(user: PermissionSubject | null | undefined): boolean {
  return user?.role === "admin" || user?.role === "sysop";
}
