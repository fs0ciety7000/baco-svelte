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

/** Droit accordé par le seul rôle (sans grants / denies) : sert à la matrice « défaut du rôle » de l'admin. */
export function roleHas(role: Role, permission: string): boolean {
  if (role === "admin" || role === "sysop") return true;
  return (ROLE_DEFAULTS[role] ?? []).includes(permission);
}

/** Catalogue des droits affichés dans la fiche d'un compte (Admin › Utilisateurs), groupés par module. */
export const PERMISSION_CATALOG: { group: string; items: { key: string; label: string }[] }[] = [
  {
    group: "Commandes",
    items: [
      { key: "otto:read", label: "Bus : lire" },
      { key: "otto:write", label: "Bus : écrire" },
      { key: "generate_taxi:read", label: "Taxi : lire" },
      { key: "generate_taxi:write", label: "Taxi : écrire" },
      { key: "b201:read", label: "B201 : lire" },
      { key: "b201:write", label: "B201 : écrire" },
    ],
  },
  {
    group: "PMR",
    items: [
      { key: "pmr:read", label: "PMR (nominatif) : lire" },
      { key: "pmr:write", label: "PMR : écrire" },
    ],
  },
  {
    group: "Opérations",
    items: [
      { key: "live:read", label: "Trains en direct" },
      { key: "ops:read", label: "Journal : lire" },
      { key: "ops:write", label: "Journal : écrire" },
      { key: "carte_pn:read", label: "Carte PN : lire" },
      { key: "carte_pn:write", label: "Carte PN : écrire" },
      { key: "stats:read", label: "Statistiques" },
    ],
  },
  {
    group: "Annuaire et données",
    items: [
      { key: "repertoire:read", label: "Annuaire : lire" },
      { key: "repertoire:write", label: "Annuaire : écrire" },
      { key: "documents:read", label: "Procédures et documents : lire" },
      { key: "documents:write", label: "Procédures et documents : écrire" },
      { key: "ptcar:read", label: "PtCar : lire" },
      { key: "ptcar:write", label: "PtCar : écrire" },
      { key: "ebp:read", label: "EBP : lire" },
      { key: "ebp:write", label: "EBP : écrire" },
      { key: "lignes:read", label: "Lignes : lire" },
      { key: "lignes:write", label: "Lignes : écrire" },
    ],
  },
  {
    group: "Administration",
    items: [{ key: "audit:read", label: "Journal d'audit : lire" }],
  },
];
