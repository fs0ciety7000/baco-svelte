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
  otto_agent: ["otto:read", "otto:write", "stats:read"],
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
    "b201:write",
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

export function isAdmin(user: PermissionSubject | null | undefined): boolean {
  return user?.role === "admin" || user?.role === "sysop";
}
