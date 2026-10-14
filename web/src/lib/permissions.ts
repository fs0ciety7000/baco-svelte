// Permissions CSM : rôle par défaut + grants / denies par agent (héritage : « Accordé » et « Retiré » s'imposent au rôle).
// Le contrôle réel est fait par les règles PocketBase ; ce module sert à l'affichage (menus, boutons).
//
// Rôles v2 (11 oct. 2026) : Administrateur et Sysop (tout), Modérateur (PACO/RCCA + suppression et Nouveautés, sans
// l'administration), PACO/RCCA (lecture partout, écriture et modification, pas de suppression), Invité (lecture des commandes bus et taxi). Chaque module a jusqu'à quatre actions : `X:read`
// (lecture), `X:write` (écriture = création), `X:update` (modification), `X:delete` (suppression).

import { CATALOG_KEYS, roleDefaults } from "./permissions/catalog";

/**
 * Rôle d'un compte : identifiant d'une fiche de la collection `roles` (lot L3 : rôles système ci-dessous, ou rôle créé
 * par un admin, ex. « coordinateur-nuit »). Les droits viennent de `users.perms`, jamais du nom du rôle (sauf admin /
 * sysop et les rôles système Écran, Connecteur, Désactivé).
 */
export type SystemRole =
  "admin" | "sysop" | "moderator" | "paco" | "guest" | "screen" | "disabled" | "connector";
export type Role = SystemRole | (string & {});

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
      {
        key: "archives",
        label: "Archives des bons (PDF)",
        actions: ["read", "delete"],
        hint: "Bons terminés et leurs sauvegardes.",
      },
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

// Rôles par défaut : catalogue v3 (`lib/permissions/catalog.ts`, `roleDefaults`), source unique partagée avec les hooks
// PocketBase (copie générée `pocketbase/pb_hooks/lib/catalog.js`). Modérateur : tout, suppression comprise ; PACO/RCCA :
// tout sauf la suppression (décision du 11 oct. 2026) ; Invité : lecture bus et taxis ; Écran, désactivé : rien (l'Écran
// lit `/tv` par `buildHandover(…, { screen: true })` et les règles propres à ce rôle, 1760003000). Les lectures
// historiques de BACO (planning:read, bus:read, taxi:read, ops:read, lignes:read) y figurent, cachées.

export type PermissionSubject = {
  role: Role;
  grants?: string[] | null;
  denies?: string[] | null;
  /** Permissions effectives écrites par PocketBase (`users.perms`, rôles v3 lot L1). Absent = ancien calcul. */
  perms?: string[] | null;
};

const CATALOG_SET = new Set(CATALOG_KEYS);

export function can(user: PermissionSubject | null | undefined, permission: string): boolean {
  // Compte « Écran » : jamais de droit, même accordé (les règles PocketBase le refusent aussi).
  if (!user || user.role === "disabled" || user.role === "screen") return false;
  // `perms` relu dans PocketBase (seul le hook l'écrit) : fait foi pour toute clé du catalogue.
  if (Array.isArray(user.perms) && CATALOG_SET.has(permission))
    return user.perms.includes(permission);
  // Ancien calcul : PocketBase sans `perms`, ou droit hors catalogue (repris de BACO, `dicos:write`…).
  if (user.role === "admin" || user.role === "sysop") return true;
  if (user.grants?.includes(permission)) return true;
  if (user.denies?.includes(permission)) return false;
  return roleDefaults(user.role).includes(permission);
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

// Rôles v3, lot L2 (14 oct. 2026) : les anciens tests de rôle sont des permissions du catalogue, testées par `can()` :
// « coordinateur » des bons → `bus:reopen` / `taxi:reopen` ; matériel complet et zones PMR → `pmr_equipment:manage` ;
// modération du Journal → `journal:moderate` ; annonces de l'équipe → `changelog:read` / `changelog:write` ; « En ligne
// maintenant » → `presence:read` ; Équipe → `team:read` ; planning → `quinyx:read` ; trains, gares, lignes → `timetable:read` ;
// onglet Fournisseurs → `suppliers:read`. Restent des rôles système en dur : admin / sysop (`isAdmin`), Écran.

/** Compte d'affichage du poste partagé : ne voit que l'écran commun `/tv`. */
export function isScreen(user: PermissionSubject | null | undefined): boolean {
  return user?.role === "screen";
}
