import {
  Accessibility,
  Bus,
  Car,
  ClipboardList,
  Database,
  Home,
  Plus,
  Train,
  Users,
  type LucideIcon,
} from "lucide-react";

import { can, isAdmin, type PermissionSubject, type Role } from "@/lib/permissions";

// Navigation : SOURCE UNIQUE pour la barre latérale, la barre d'onglets mobile, « Plus », ⌘K et les onglets
// des modules. 6 modules au maximum (docs/CSM-V2.md §2) ; l'administration est dans le menu utilisateur.

export type NavTab = {
  href: string;
  label: string;
  permission?: string;
  /** Rôles pour lesquels l'onglet est masqué (repris de la v1). */
  hideFor?: Role[];
  keywords?: string[];
};
export type NavModule = {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
  /** Présent dans la barre d'onglets mobile (4 au maximum, le reste va dans « Plus »). */
  mobile?: boolean;
  tabs: NavTab[];
};

export const MODULES: NavModule[] = [
  { id: "accueil", href: "/", label: "Accueil", icon: Home, mobile: true, tabs: [] },
  {
    id: "commandes",
    href: "/commandes",
    label: "Commandes",
    icon: Bus,
    mobile: true,
    tabs: [
      {
        href: "/commandes",
        label: "Bus",
        permission: "otto:read",
        keywords: ["C3", "otto", "bon"],
      },
      { href: "/commandes/taxi", label: "Taxi", permission: "generate_taxi:read" },
      {
        href: "/commandes/suivi",
        label: "Suivi",
        permission: "otto:read",
        keywords: ["kanban", "statut"],
      },
      {
        href: "/commandes/b201",
        label: "Remise B201",
        permission: "b201:read",
        keywords: ["remise", "service"],
      },
    ],
  },
  {
    id: "pmr",
    href: "/pmr",
    label: "PMR",
    icon: Accessibility,
    mobile: true,
    tabs: [
      {
        href: "/pmr",
        label: "Missions PMR",
        permission: "deplacements:read",
        keywords: ["déplacements", "DICOS", "assistance"],
      },
      {
        href: "/groupes",
        label: "Groupes",
        permission: "pmr:read",
        keywords: ["école", "groupe", "DICOS"],
      },
      { href: "/pmr/historique", label: "Historique", permission: "deplacements:read" },
      { href: "/pmr/clients", label: "Clients", permission: "pmr:read" },
      { href: "/pmr/materiel", label: "Rampes et matériel", permission: "pmr:read" },
    ],
  },
  {
    id: "operations",
    href: "/operations",
    label: "Opérations",
    icon: Train,
    mobile: true,
    tabs: [
      {
        href: "/operations",
        label: "Trains en direct",
        permission: "live:read",
        keywords: ["iRail", "départs", "retards"],
      },
      {
        href: "/operations/journal",
        label: "Journal",
        permission: "journal:read",
        keywords: ["main courante", "messages", "consignes"],
      },
      {
        href: "/operations/carte-pn",
        label: "Carte PN",
        permission: "carte_pn:read",
        keywords: ["passages à niveau"],
      },
      { href: "/operations/statistiques", label: "Statistiques", permission: "stats:read" },
    ],
  },
  {
    id: "referentiels",
    href: "/referentiels",
    label: "Annuaire et données",
    icon: Database,
    tabs: [
      {
        href: "/referentiels",
        label: "Annuaire",
        permission: "repertoire:read",
        keywords: ["répertoire", "sociétés", "taxis", "contacts"],
      },
      { href: "/referentiels/lignes", label: "Lignes", hideFor: ["otto_agent"] },
      {
        href: "/referentiels/ptcar",
        label: "PtCar",
        permission: "ptcar:read",
        keywords: ["gares", "abréviations"],
      },
      { href: "/referentiels/ebp", label: "EBP", permission: "ebp:read" },
      {
        href: "/referentiels/documents",
        label: "Procédures et documents",
        permission: "documents:read",
      },
    ],
  },
  {
    id: "equipe",
    href: "/equipe",
    label: "Équipe",
    icon: Users,
    tabs: [
      // Planning et congés : pas pour l'instant (décision du 9 oct. 2026).
      {
        href: "/equipe",
        label: "Annuaire de l'équipe",
        hideFor: ["otto_agent"],
        keywords: ["collègues"],
      },
      { href: "/equipe/profil", label: "Mon profil", keywords: ["mot de passe", "compte"] },
      {
        href: "/equipe/nouveautes",
        label: "Nouveautés",
        hideFor: ["otto_agent"],
        keywords: ["changelog"],
      },
    ],
  },
];

export const ADMIN: NavModule = {
  id: "admin",
  href: "/admin",
  label: "Administration",
  icon: ClipboardList,
  tabs: [
    { href: "/admin", label: "Utilisateurs" },
    { href: "/admin/lignes", label: "Lignes et arrêts" },
    { href: "/admin/audit", label: "Journal d'audit" },
    { href: "/admin/sante", label: "Santé" },
  ],
};

export type QuickAction = { href: string; label: string; icon: LucideIcon; permission: string };

export const QUICK_ACTIONS: QuickAction[] = [
  { href: "/commandes/nouveau", label: "Bon de commande bus", icon: Bus, permission: "otto:write" },
  {
    href: "/commandes/taxi/nouveau",
    label: "Bon de commande taxi",
    icon: Car,
    permission: "generate_taxi:write",
  },
  {
    href: "/operations/journal",
    label: "Message au journal",
    icon: Plus,
    permission: "journal:write",
  },
];

function tabAllowed(user: PermissionSubject, tab: NavTab) {
  if (tab.hideFor?.includes(user.role)) return false;
  return !tab.permission || can(user, tab.permission);
}

/** Modules visibles pour l'agent : un module sans onglet autorisé disparaît. */
export function visibleModules(user: PermissionSubject): NavModule[] {
  return MODULES.map((m) => ({ ...m, tabs: m.tabs.filter((t) => tabAllowed(user, t)) }))
    .filter((m) => m.id === "accueil" || m.tabs.length > 0)
    .map((m) =>
      m.tabs.length > 0 && !m.tabs.some((t) => t.href === m.href)
        ? { ...m, href: m.tabs[0]!.href }
        : m,
    );
}

export function adminModule(user: PermissionSubject): NavModule | null {
  return isAdmin(user) ? ADMIN : null;
}

export function quickActions(user: PermissionSubject): QuickAction[] {
  return QUICK_ACTIONS.filter((a) => can(user, a.permission));
}

/** Module actif pour un chemin (le plus long préfixe). */
export function activeModule(pathname: string, modules: NavModule[]): NavModule | undefined {
  const all = [...modules, ADMIN];
  if (pathname === "/") return all.find((m) => m.id === "accueil");
  return all
    .filter((m) => m.id !== "accueil")
    .find(
      (m) =>
        pathname === m.href ||
        pathname.startsWith(`${m.href}/`) ||
        m.tabs.some((t) => pathname === t.href || pathname.startsWith(`${t.href}/`)),
    );
}

/** Onglet actif : correspondance exacte, sinon le plus long préfixe. */
export function activeTab(pathname: string, module: NavModule): NavTab | undefined {
  const exact = module.tabs.find((t) => t.href === pathname);
  if (exact) return exact;
  return (
    [...module.tabs]
      .filter((t) => t.href !== module.href && pathname.startsWith(`${t.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0] ??
    module.tabs.find((t) => t.href === module.href)
  );
}
