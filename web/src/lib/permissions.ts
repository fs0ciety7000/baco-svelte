// Permissions CSM : rôle par défaut + grants / denies par agent (héritage : « Accordé » et « Retiré » s'imposent au rôle).
// Le contrôle réel est fait par les règles PocketBase ; ce module sert à l'affichage (menus, boutons).
//
// Rôles v2 (11 oct. 2026) : Administrateur et Sysop (tout), Modérateur (PACO/RCCA + suppression et Nouveautés, sans
// l'administration), PACO/RCCA (lecture partout, écriture et modification, pas de suppression), Invité (lecture des commandes bus et taxi). Chaque module a jusqu'à quatre actions : `X:read`
// (lecture), `X:write` (écriture = création), `X:update` (modification), `X:delete` (suppression).

export type Role = "admin" | "sysop" | "moderator" | "paco" | "guest" | "disabled";

export type Action = "read" | "write" | "update" | "delete";

export const ACTIONS: Action[] = ["read", "write", "update", "delete"];

export const ACTION_LABEL: Record<Action, string> = {
  read: "Lecture",
  write: "Écriture",
  update: "Modification",
  delete: "Suppression",
};

export type PermissionModule = { key: string; label: string; actions: Action[]; hint?: string };

const ALL: Action[] = ["read", "write", "update", "delete"];

/**
 * Catalogue des droits (Admin › Utilisateurs), groupé comme la navigation. Clés réellement testées par les règles
 * PocketBase, la navigation et les pages (`permissions.test.ts` vérifie que la navigation est couverte).
 * « audit:read » volontairement absent : le journal contient du nominatif PMR (audit du 9 oct. 2026).
 */
export const PERMISSION_MODULES: { group: string; modules: PermissionModule[] }[] = [
  {
    group: "Commandes",
    modules: [
      { key: "otto", label: "Bus", actions: ALL },
      { key: "generate_taxi", label: "Taxis", actions: ALL },
      { key: "b201", label: "B201", actions: ALL },
    ],
  },
  {
    group: "PMR",
    modules: [
      { key: "deplacements", label: "Missions PMR et groupes", actions: ALL },
      {
        key: "pmr",
        label: "PMR nominatif, clients et matériel",
        actions: ALL,
        hint: "Lecture : noms et coordonnées des voyageurs.",
      },
    ],
  },
  {
    group: "Opérations",
    modules: [
      { key: "live", label: "Trains en direct", actions: ["read"] },
      { key: "journal", label: "Journal", actions: ALL },
      { key: "carte_pn", label: "Carte PN", actions: ALL },
      { key: "stats", label: "Statistiques", actions: ["read"] },
    ],
  },
  {
    group: "Ressources",
    modules: [
      { key: "repertoire", label: "Annuaire", actions: ALL },
      { key: "documents", label: "Procédures et documents", actions: ALL },
      { key: "ptcar", label: "PtCar", actions: ALL },
      { key: "ebp", label: "EBP", actions: ALL },
      { key: "lignes", label: "Lignes et arrêts", actions: ["write", "update", "delete"] },
    ],
  },
];

/** Toutes les clés du catalogue (« otto:read »…). */
export const PERMISSION_KEYS: string[] = PERMISSION_MODULES.flatMap((g) =>
  g.modules.flatMap((m) => m.actions.map((a) => `${m.key}:${a}`)),
);

/** Ancienne forme (liste à plat), gardée pour les contrôles de couverture. */
export const PERMISSION_CATALOG: { group: string; items: { key: string; label: string }[] }[] =
  PERMISSION_MODULES.map((g) => ({
    group: g.group,
    items: g.modules.flatMap((m) =>
      m.actions.map((a) => ({ key: `${m.key}:${a}`, label: `${m.label} : ${ACTION_LABEL[a]}` })),
    ),
  }));

// Lectures historiques (BACO) encore citées par quelques écrans : accordées comme les autres lectures.
const LEGACY_READ = ["planning:read", "bus:read", "taxi:read", "ops:read", "lignes:read"];

const ROLE_DEFAULTS: Record<Role, string[]> = {
  admin: ["*"],
  sysop: ["*"],
  // Modérateur : tout le catalogue, suppression comprise ; pas l'administration (comptes, réglages).
  moderator: [...PERMISSION_KEYS, ...LEGACY_READ],
  // PACO/RCCA : tout sauf la suppression (décision du 11 oct. 2026).
  paco: [...PERMISSION_KEYS.filter((k) => !k.endsWith(":delete")), ...LEGACY_READ],
  // Invité : lecture des commandes bus et taxi.
  guest: ["otto:read", "generate_taxi:read"],
  disabled: [],
};

export type PermissionSubject = { role: Role; grants?: string[] | null; denies?: string[] | null };

export function can(user: PermissionSubject | null | undefined, permission: string): boolean {
  if (!user || user.role === "disabled") return false;
  if (user.role === "admin" || user.role === "sysop") return true;
  if (user.grants?.includes(permission)) return true;
  if (user.denies?.includes(permission)) return false;
  return (ROLE_DEFAULTS[user.role] ?? []).includes(permission);
}

/**
 * Remise B201 : écrite et modifiée par tout PACO/RCCA (rôles v2 : son district ne limite plus l'écriture), par un
 * admin, ou sur droit accordé. Miroir des règles PocketBase (`1760002800`).
 */
export function canWriteB201(user: PermissionSubject | null | undefined): boolean {
  return can(user, "b201:write") || can(user, "b201:update");
}

export function isAdmin(user: PermissionSubject | null | undefined): boolean {
  return user?.role === "admin" || user?.role === "sysop";
}

/**
 * « Coordinateur » des anciens écrans (annulations, rétablissements, matériel complet, entrées du Journal des autres) :
 * depuis les rôles v2, tout PACO/RCCA, plus les administrateurs. Miroir des hooks PocketBase.
 */
export function isCoordinator(user: PermissionSubject | null | undefined): boolean {
  return isAdmin(user) || user?.role === "moderator" || user?.role === "paco";
}

/**
 * Modération du Journal (messages retirés, textes des autres, retrait tardif, rétablissement) : modérateurs et
 * administrateurs seulement (audit sécurité du 11 oct. 2026). Miroir de `COORD_ROLES` (hooks) et des règles `ops_log`.
 */
export function isJournalModerator(user: PermissionSubject | null | undefined): boolean {
  return isAdmin(user) || user?.role === "moderator";
}

/** Nouveautés de l'application : administrateurs et modérateurs. */
export function canEditChangelog(user: PermissionSubject | null | undefined): boolean {
  return isAdmin(user) || user?.role === "moderator";
}

/** Droit accordé par le seul rôle (sans grants / denies) : sert à la matrice « défaut du rôle » de l'admin. */
export function roleHas(role: Role, permission: string): boolean {
  if (role === "admin" || role === "sysop") return true;
  return (ROLE_DEFAULTS[role] ?? []).includes(permission);
}
